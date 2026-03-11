/**
 * DOC: client\cotizadorcp\cotizacion.js
 * Proposito: Creacion de cotizaciones (administracion).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

let clientProfiles = [];
let clientProfilesById = {};

window.finalMontajeDates = [];
window.tempMontajeDates = [];
window.currentMontajePrefix = 'q';

async function loadClientProfilesForQuoteModal() {
    const sel = document.getElementById('cli-select'); const hid = document.getElementById('cli-id'); if (!sel || !window.finSupabase) return;
    try {
        const { data, error } = await window.finSupabase.from('clientes').select('id,nombre_completo,telefono,correo,rfc').order('nombre_completo', { ascending: true });
        if (error) throw error; clientProfiles = data || []; clientProfilesById = {}; clientProfiles.forEach(c => clientProfilesById[c.id] = c);
        sel.innerHTML = '<option value="">— Capturar manualmente —</option>' + clientProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()}</option>`).join('');
        sel.onchange = () => { const id = sel.value; if (!id) { if (hid) hid.value = ''; return; } const c = clientProfilesById[id]; if (!c) return; if (hid) hid.value = id; const n = document.getElementById('cli-name'); const p = document.getElementById('cli-phone'); const e = document.getElementById('cli-email'); const r = document.getElementById('cli-rfc'); if (n) n.value = c.nombre_completo || ''; if (p) p.value = (c.telefono || ''); if (e) e.value = (c.correo || ''); if (r) r.value = (c.rfc || ''); };
        const clearAssoc = () => { if (sel.value) sel.value = ''; if (hid) hid.value = ''; }; ['cli-name','cli-phone','cli-email','cli-rfc'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', clearAssoc); });
    } catch (e) { console.warn("No se pudo cargar clientes", e); }
}

const SB_URL = window.HUB_CONFIG?.supabaseUrl || window.ENV?.SUPABASE_URL || '';
const SB_KEY = window.HUB_CONFIG?.supabaseAnonKey || window.ENV?.SUPABASE_ANON_KEY || '';
const __cpPath = window.location.pathname || '';
const __cpIsCP = /\/cotizadorcp(\/|$)/.test(__cpPath) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __cpIsCP ? 'finanzas_casadepiedra' : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_CASA_PIEDRA || 'finanzas');
const CP_PAGE_MODE = window.__CP_PAGE_MODE || 'catalog_admin';
const IS_QUOTE_PAGE = CP_PAGE_MODE === 'cotizacion';
const IS_CATALOG_ADMIN_PAGE = CP_PAGE_MODE === 'catalog_admin';

let allSpaces = [], catalogConcepts = [], dbTaxes = [], currentSpace = null, currentPricing = { base:0, final:0 };
let adminSelectedConcepts = []; let myPermissions = { access:false, catalog_manage:false };
let __cpPremontajePct = 25;
let __cpHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };

function parseIds(v){ if(!v) return []; if(Array.isArray(v)) return v; if(typeof v === 'string'){ try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch(e){ return v.split(',').map(x=>x.trim()).filter(Boolean); } } return []; }
function formatMoney(v){ return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); }
window.safeFormatDate = function(dateStr) { if (!dateStr) return '--'; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; return `${parts[2]}/${parts[1]}/${parts[0]}`; };
function getPremontajePct(){ const n = parseFloat(__cpPremontajePct); return Number.isFinite(n) && n >= 0 ? n : 25; }
function __cpGetHoraExtraCfg(){
    const modeRaw = String(__cpHoraExtraCfg?.mode || '').toLowerCase();
    const mode = (modeRaw === 'fixed' || modeRaw === 'percent') ? modeRaw : 'percent';
    const parsedValue = parseFloat(__cpHoraExtraCfg?.value);
    const value = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 100;
    const allowCustom = __cpHoraExtraCfg?.allowCustom !== false;
    return { mode, value, allowCustom };
}
function __cpResolveHoraExtraUnit(space){
    const cfg = __cpGetHoraExtraCfg();
    const base = parseFloat(__cpB2B(space)?.precio_hora_extra || 0) || 0;
    return cfg.mode === 'fixed' ? cfg.value : (base * (cfg.value / 100));
}
// FullCalendar necesita resize después de abrir modal para evitar render compacto inicial.
function __cpRefreshCalendarLayout(calendar){
    if (!calendar || typeof calendar.updateSize !== 'function') return;
    const refresh = () => { try { calendar.updateSize(); } catch (e) {} };
    requestAnimationFrame(() => {
        refresh();
        setTimeout(refresh, 60);
        setTimeout(refresh, 180);
    });
}
function getSpaceMaxCapacity(space){
    let rules = [];
    try { rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space?.precios_por_dia || []); } catch(e){}
    if(!Array.isArray(rules) || !rules.length) return 999999;
    const finite = rules.map(r => parseInt(r?.max, 10)).filter(v => Number.isFinite(v) && v > 0 && v < 999999);
    return finite.length ? Math.max(...finite) : 999999;
}
async function loadPremontajePctConfig() {
    __cpPremontajePct = 25;
    __cpHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
    try {
        const { data, error } = await window.finSupabase
            .from('configuracion')
            .select('clave,valor_json,valor_num')
            .in('clave', ['premontaje_pct', 'hora_extra_cfg']);
        if (error) throw error;
        (Array.isArray(data) ? data : []).forEach(row => {
            const key = String(row?.clave || '').toLowerCase();
            if (key === 'premontaje_pct') {
                const raw = row?.valor_num ?? row?.valor_json?.value ?? row?.valor_json?.percent;
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed) && parsed >= 0) __cpPremontajePct = parsed;
                return;
            }
            if (key === 'hora_extra_cfg') {
                const modeRaw = String(row?.valor_json?.mode || '').toLowerCase();
                const mode = (modeRaw === 'fixed' || modeRaw === 'percent') ? modeRaw : 'percent';
                const rawVal = row?.valor_num ?? row?.valor_json?.value ?? 100;
                const parsedVal = parseFloat(rawVal);
                const value = Number.isFinite(parsedVal) && parsedVal >= 0 ? parsedVal : 100;
                const allowCustom = row?.valor_json?.allow_custom !== false;
                __cpHoraExtraCfg = { mode, value, allowCustom };
            }
        });
    } catch (e) {
        __cpPremontajePct = 25;
        __cpHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
    }
}

function calculateDayByDayTotal(space, startStr, endStr, guests) {
    if (!startStr) return { total: 0 };
    const endS = endStr || startStr;
    let rules = [];
    try { rules = typeof space.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space.precios_por_dia || []); } catch(e){}
    if (!Array.isArray(rules) || rules.length === 0) rules = [{ min: 0, max: 999999, precios: {lunes: space.precio_base||0, martes:space.precio_base||0, miercoles:space.precio_base||0, jueves:space.precio_base||0, viernes:space.precio_base||0, sabado:space.precio_base||0, domingo:space.precio_base||0} }];
    
    const guestCount = parseInt(guests) || 1;
    let activeRule = rules.find(r => guestCount >= r.min && guestCount <= r.max);
    if (!activeRule) activeRule = rules[rules.length - 1];
    
    const prices = activeRule ? (activeRule.precios || {}) : {}; let total = 0;
    const start = new Date(startStr + 'T00:00:00'); const end = new Date(endS + 'T00:00:00'); const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    let blockedDays = []; try { blockedDays = typeof space.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space.dias_bloqueados || []); } catch(e){}
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = keys[d.getDay()]; let price = parseFloat(prices[key] || 0);
        if (blockedDays.includes(key)) price = 0;
        total += price;
    }
    return { total };
}

// CLICK AFUERA CIERRA MODALES (EXCEPTO CUANDO SE REQUIERE CONFIRMACIÓN O EDICIÓN)
window.addEventListener('click', function(e) {
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
    if (window.supabase) { if(!window.finSupabase) window.finSupabase = window.supabase.createClient(SB_URL, SB_KEY, { db: { schema: FIN_SCHEMA } }); if(!window.globalSupabase) window.globalSupabase = window.supabase.createClient(SB_URL, SB_KEY); }
    const { data: { session } } = await window.globalSupabase.auth.getSession(); if (!session) return;
    const { data: profile } = await window.globalSupabase.from('profiles').select('*').eq('id', session.user.id).single();
    const userRole = String(profile?.role || '').toLowerCase().trim(); const roleHasAccess = (userRole === 'admin') || (userRole === 'casa_de_piedra') || (userRole === 'ambos');
    if (userRole === 'admin') myPermissions = { access: true, catalog_manage: true }; else if (roleHasAccess) myPermissions = { access: true, catalog_manage: false }; else myPermissions = profile.app_metadata?.finanzas?.permissions || { access: false };
    if (!myPermissions.access) return window.showToast?.('No tienes permisos.', 'error');
    if (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE) { const btn = document.getElementById('btn-new-space'); if(btn) btn.classList.remove('hidden'); }
    await loadTaxes();
    await loadPremontajePctConfig();
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
        const { data } = await window.finSupabase.from('conceptos_catalogo').select('*').eq('activo', true);
        catalogConcepts = data || [];
        const preselect = new URLSearchParams(window.location.search || '').get('space');
        if (preselect) setTimeout(() => window.openQuoteModal(isNaN(Number(preselect)) ? preselect : Number(preselect)), 150);
    }
});

async function loadTaxes() { const { data } = await window.finSupabase.from('impuestos').select('*'); dbTaxes = data || []; }
async function loadCatalog() { const { data } = await window.finSupabase.from('espacios').select('*').order('id'); allSpaces = data||[]; renderSpaces(allSpaces); }

function renderSpaces(list) {
    const g = document.getElementById('spaces-grid');
    g.innerHTML = '';
    if (list.length === 0) {
        g.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400 font-bold">No se encontraron espacios.</div>';
        return;
    }
    list.forEach(s => {
        const inQuote = IS_QUOTE_PAGE && Array.isArray(__cpQuoteSpaces) && __cpQuoteSpaces.some(x => String(x.spaceId) === String(s.id));
        const isActiveQuote = IS_QUOTE_PAGE && String(__cpActiveSpaceId || '') === String(s.id);
        if (IS_QUOTE_PAGE) {
            const cardState = isActiveQuote
                ? 'border-emerald-400 ring-2 ring-emerald-300 bg-emerald-50'
                : (inQuote ? 'border-yellow-300 ring-1 ring-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white');
            const stateLabel = isActiveQuote
                ? '<span class="text-[9px] font-black uppercase text-emerald-700">Activo</span>'
                : (inQuote ? '<span class="text-[9px] font-black uppercase text-brand-dark">Seleccionado</span>' : '<span class="text-[9px] font-bold uppercase text-gray-400">Desactivado</span>');
            const powerOffBtn = inQuote
                ? `<button type="button" onclick="event.stopPropagation(); window.powerOffQuoteSpace('${s.id}')" class="px-2 py-1 rounded border border-gray-200 bg-white text-[9px] font-black uppercase text-gray-600 hover:text-red-600">Desactivar</button>`
                : '';
            g.innerHTML += `<div onclick="window.toggleQuoteSpaceCard('${s.id}')" class="rounded-xl border ${cardState} p-4 shadow-sm transition hover:shadow-md cursor-pointer">
                <div class="mb-3">
                    <p class="text-sm font-black text-gray-800 uppercase leading-tight">${s.nombre}</p>
                    <p class="text-[10px] font-mono text-gray-400 mt-1">${s.clave || '--'}</p>
                </div>
                <div class="space-y-1.5 mb-4 text-[11px]">
                    <div class="flex justify-between gap-2"><span class="text-gray-400 font-bold uppercase">Invitados</span><span class="text-gray-700 font-bold text-right">${__cpGuestRangeText(s)}</span></div>
                    <div class="flex justify-between gap-2"><span class="text-gray-400 font-bold uppercase">Horarios</span><span class="text-gray-700 font-bold text-right">${__cpHorariosText(s)}</span></div>
                </div>
                <div class="flex items-center justify-between gap-2">${stateLabel}${powerOffBtn}</div>
            </div>`;
            return;
        }

        let displayImg = '../../assets/img/placeholder_cp.png';
        if (s.imagen_url) {
            if (s.imagen_url.trim().startsWith('[')) {
                try { const parsed = JSON.parse(s.imagen_url); if (parsed.length > 0) displayImg = parsed[0]; } catch (e) { displayImg = s.imagen_url; }
            } else displayImg = s.imagen_url;
        }
        let eTags = [];
        try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch (e) {}
        let tagsHtml = '';
        if (eTags.length > 0) tagsHtml = `<div class="flex gap-1 mb-2 flex-wrap">${eTags.map(t => `<span class="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">${t}</span>`).join('')}</div>`;
        const editBtn = (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE) ? `<button onclick="window.openManagerModal(${s.id})" class="absolute top-3 right-3 bg-white/90 text-gray-700 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all z-10"><i class="fa-solid fa-pen"></i></button>` : '';
        const actionBtn = (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE)
            ? `<div class="border-t pt-3"><button onclick="window.openManagerModal(${s.id})" class="bg-gray-900 text-white w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-brand-red transition-colors duration-300 shadow-lg"><i class="fa-solid fa-sliders mr-2"></i> Administrar Espacio</button></div>`
            : '';
        g.innerHTML += `<div class="bg-white rounded-xl shadow-md relative group hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden border border-gray-100"><div class="h-48 bg-gray-200 relative overflow-hidden">${editBtn}<img src="${displayImg}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"><div class="absolute bottom-3 left-4 text-white z-10"><p class="text-[10px] font-bold uppercase tracking-wider bg-brand-red px-2 py-0.5 rounded inline-block mb-1">${s.tipo}</p><h3 class="font-bold text-lg leading-tight shadow-black drop-shadow-md">${s.nombre}</h3></div></div><div class="p-5">${tagsHtml}<div class="flex justify-between items-center mb-4"><p class="text-xs text-gray-400 font-mono"><i class="fa-solid fa-tag mr-1"></i>${s.clave}</p></div><p class="text-xs text-gray-500 line-clamp-2 mb-4 h-8">${s.descripcion || ''}</p>${actionBtn}</div></div>`;
    });
}

window.addRangeRow = function(data = null) {
    const container = document.getElementById('mgr-ranges-container'); const id = Date.now() + Math.random().toString(36).substr(2, 5);
    const min = data ? data.min : 1; const max = data ? data.max : 100; const prices = data ? data.precios : {lunes:0, martes:0, miercoles:0, jueves:0, viernes:0, sabado:0, domingo:0};
    const row = document.createElement('div'); row.className = "range-row bg-gray-50 p-3 rounded-lg border border-gray-200 relative animate-enter"; row.id = `range-${id}`;
    row.innerHTML = `<div class="flex justify-between items-center mb-2"><div class="flex items-center gap-2"><span class="text-[10px] font-bold uppercase text-brand-red bg-yellow-50 px-2 py-0.5 rounded">Rango</span><input type="number" class="range-min w-16 border rounded text-xs p-1 text-center font-bold" value="${min}"><span class="text-xs text-gray-400">-</span><input type="number" class="range-max w-16 border rounded text-xs p-1 text-center font-bold" value="${max}"><span class="text-[10px] font-bold uppercase text-gray-400 ml-1">Personas</span></div><button onclick="document.getElementById('range-${id}').remove()" class="text-gray-400 hover:text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div><div class="grid grid-cols-4 gap-2"><div><label class="text-[9px] uppercase font-bold text-gray-400">Lun</label><input type="number" value="${prices.lunes}" class="p-lun w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Mar</label><input type="number" value="${prices.martes}" class="p-mar w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Mié</label><input type="number" value="${prices.miercoles}" class="p-mie w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Jue</label><input type="number" value="${prices.jueves}" class="p-jue w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Vie</label><input type="number" value="${prices.viernes}" class="p-vie w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Sáb</label><input type="number" value="${prices.sabado}" class="p-sab w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Dom</label><input type="number" value="${prices.domingo}" class="p-dom w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div></div>`;
    container.appendChild(row);
}

window.addHorarioRow = function(data = null) {
    const container = document.getElementById('mgr-horarios-container'); const nombre = data ? data.nombre : ''; const start = data ? data.start : ''; const end = data ? data.end : ''; const price = data ? data.price : 0;
    const row = document.createElement('div'); row.className = "horario-row flex flex-col sm:flex-row gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200 animate-enter";
    row.innerHTML = `<input type="text" placeholder="Nombre (Ej. Turno Especial)" value="${nombre}" class="h-name w-full sm:w-1/3 border rounded p-1.5 text-xs outline-none focus:border-brand-red font-bold text-gray-700"><input type="time" value="${start}" class="h-start w-full sm:w-auto border rounded p-1.5 text-xs outline-none focus:border-brand-red"><span class="text-xs text-gray-400">a</span><input type="time" value="${end}" class="h-end w-full sm:w-auto border rounded p-1.5 text-xs outline-none focus:border-brand-red"><input type="number" placeholder="Precio $" value="${price}" class="h-price w-full sm:w-24 border rounded p-1.5 text-xs text-right outline-none focus:border-brand-red font-bold"><button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 transition px-2"><i class="fa-solid fa-trash"></i></button>`;
    container.appendChild(row);
}

window.openManagerModal = function(id){
    if (!myPermissions.catalog_manage) return window.showToast("No tienes permisos.", "error"); 
    document.getElementById('mgr-id').value = id || ''; const container = document.getElementById('mgr-taxes-list'); document.querySelectorAll('.day-block-check').forEach(cb => cb.checked = false);
    if(container) { container.innerHTML = ''; let currentTaxes = []; if(id) { const s = allSpaces.find(x => x.id === id); currentTaxes = parseIds(s.impuestos_ids); } dbTaxes.forEach(t => { const isChecked = currentTaxes.some(cid => String(cid) === String(t.id)) ? 'checked' : ''; container.innerHTML += `<label class="flex items-center gap-2 p-2 border rounded bg-white hover:bg-gray-50 cursor-pointer"><input type="checkbox" value="${t.id}" class="tax-check accent-brand-red cursor-pointer" ${isChecked}><span class="text-[10px] font-bold uppercase text-gray-600 cursor-pointer select-none">${t.nombre} (${t.porcentaje}%)</span></label>`; }); }

    const rangesContainer = document.getElementById('mgr-ranges-container'); rangesContainer.innerHTML = '';
    const horariosContainer = document.getElementById('mgr-horarios-container'); horariosContainer.innerHTML = '';

    if(id) { 
        const s = allSpaces.find(x => x.id === id); 
        document.getElementById('mgr-title').innerText = "Editar: " + s.nombre; document.getElementById('mgr-key').value = s.clave; document.getElementById('mgr-key').disabled = true; document.getElementById('mgr-name').value = s.nombre; document.getElementById('mgr-type').value = s.tipo; document.getElementById('mgr-desc').value = s.descripcion || ''; 
        let eTags = []; try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch(e){}
        if(!Array.isArray(eTags)) eTags = []; document.getElementById('mgr-tags').value = eTags.join(', ');

        let rules = []; try { rules = typeof s.precios_por_dia === 'string' ? JSON.parse(s.precios_por_dia) : (s.precios_por_dia || []); } catch(e){}
        if (!Array.isArray(rules) || rules.length === 0) rules = [{min: 1, max: 9999, precios: {lunes:0, martes:0, miercoles:0, jueves:0, viernes:0, sabado:0, domingo:0}}];
        rules.forEach(rule => window.addRangeRow(rule));

        let blockedDays = []; try { blockedDays = typeof s.dias_bloqueados === 'string' ? JSON.parse(s.dias_bloqueados) : (s.dias_bloqueados || []); } catch(e){}
        document.querySelectorAll('.day-block-check').forEach(cb => { if(blockedDays.includes(cb.value)) cb.checked = true; });

        let b2b = {}; try { b2b = typeof s.config_b2b === 'string' ? JSON.parse(s.config_b2b) : (s.config_b2b || {}); } catch(e){}
        document.getElementById('cfg-precio-hora').value = b2b.precio_hora_extra || 0;
        let h = b2b.horarios || []; if (!Array.isArray(h)) { const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' }; h = Object.keys(h).map(k => ({ nombre: mapNames[k] || k, start: h[k].start, end: h[k].end, price: h[k].price })).filter(item => item.start && item.end); }
        if (h.length > 0) h.forEach(item => window.addHorarioRow(item)); else window.addHorarioRow();

        document.getElementById('mgr-adj-type').value = s.ajuste_tipo || 'ninguno'; document.getElementById('mgr-adj-pct').value = s.ajuste_porcentaje || 0; document.getElementById('mgr-active').checked = s.activa !== false; document.getElementById('btn-delete-mgr').classList.remove('hidden'); if(s.imagen_url) { document.getElementById('mgr-preview').src = s.imagen_url.startsWith('[') ? JSON.parse(s.imagen_url)[0] : s.imagen_url; document.getElementById('mgr-preview').classList.remove('hidden'); }
    } else { 
        document.getElementById('mgr-title').innerText = "Nuevo Espacio"; document.getElementById('mgr-key').value = ''; document.getElementById('mgr-key').disabled = false; document.getElementById('mgr-name').value = ''; document.getElementById('mgr-tags').value = ''; document.getElementById('mgr-desc').value = ''; window.addRangeRow(); window.addHorarioRow(); 
        document.getElementById('cfg-precio-hora').value = 0; document.getElementById('mgr-active').checked = true; document.getElementById('btn-delete-mgr').classList.add('hidden'); document.getElementById('mgr-preview').src = ''; document.getElementById('mgr-preview').classList.add('hidden');
    } 
    window.openModal('manager-modal');
}

window.saveSpace = async function(){ 
    if (!myPermissions.catalog_manage) return; const btn = document.getElementById('btn-save-mgr'); btn.disabled = true; btn.innerText = "Guardando...";
    try {
        const id = document.getElementById('mgr-id').value; 
        const selectedTaxes = Array.from(document.querySelectorAll('.tax-check:checked')).map(cb => parseInt(cb.value));
        const blockedDays = Array.from(document.querySelectorAll('.day-block-check:checked')).map(cb => cb.value);

        const rows = document.querySelectorAll('.range-row'); let ranges = []; let maxPriceFound = 0;
        rows.forEach(row => {
            const min = parseInt(row.querySelector('.range-min').value) || 0; const max = parseInt(row.querySelector('.range-max').value) || 999999;
            const precios = { lunes: parseFloat(row.querySelector('.p-lun').value) || 0, martes: parseFloat(row.querySelector('.p-mar').value) || 0, miercoles: parseFloat(row.querySelector('.p-mie').value) || 0, jueves: parseFloat(row.querySelector('.p-jue').value) || 0, viernes: parseFloat(row.querySelector('.p-vie').value) || 0, sabado: parseFloat(row.querySelector('.p-sab').value) || 0, domingo: parseFloat(row.querySelector('.p-dom').value) || 0 };
            const localMax = Math.max(...Object.values(precios)); if(localMax > maxPriceFound) maxPriceFound = localMax; ranges.push({ min, max, precios });
        });
        
        const tagsArray = (document.getElementById('mgr-tags').value || '').split(',').map(t => t.trim()).filter(Boolean); 

        let horariosArray = []; document.querySelectorAll('.horario-row').forEach(row => { const nombre = row.querySelector('.h-name').value.trim(); const start = row.querySelector('.h-start').value; const end = row.querySelector('.h-end').value; const price = parseFloat(row.querySelector('.h-price').value) || 0; if (nombre && start && end) horariosArray.push({ nombre, start, end, price }); });
        const b2bConfig = { precio_hora_extra: parseFloat(document.getElementById('cfg-precio-hora').value) || 0, horarios: horariosArray };

        const fileInput = document.getElementById('mgr-file'); let imgUrl = null;
        if(id) { const existing = allSpaces.find(s => s.id == id); imgUrl = existing ? existing.imagen_url : null; }
        if(fileInput.files && fileInput.files.length > 0) { const file = fileInput.files[0]; const fileExt = file.name.split('.').pop(); const filePath = `espacios/${Date.now()}.${fileExt}`; const { error } = await window.globalSupabase.storage.from('Espacios').upload(filePath, file); if(error) throw error; imgUrl = window.globalSupabase.storage.from('Espacios').getPublicUrl(filePath).data.publicUrl; }

        const payload = { 
            clave: document.getElementById('mgr-key').value.toUpperCase().trim(), nombre: document.getElementById('mgr-name').value, tipo: document.getElementById('mgr-type').value, descripcion: document.getElementById('mgr-desc').value, precio_base: maxPriceFound, 
            precios_por_dia: ranges, dias_bloqueados: blockedDays, config_b2b: b2bConfig, etiquetas: tagsArray, 
            ajuste_tipo: document.getElementById('mgr-adj-type').value, ajuste_porcentaje: parseFloat(document.getElementById('mgr-adj-pct').value) || 0, activa: document.getElementById('mgr-active').checked, impuestos_ids: selectedTaxes, imagen_url: imgUrl 
        }; 

        if(id) { const { error: updErr } = await window.finSupabase.from('espacios').update(payload).eq('id', id); if(updErr) throw updErr; } else { const { error: insErr } = await window.finSupabase.from('espacios').insert(payload); if(insErr) throw insErr; } 
        window.showToast("Guardado", "success"); window.closeModal('manager-modal'); loadCatalog(); fileInput.value = '';

    } catch(e) { console.error("Error al guardar:", e); window.showToast("Error: Verifica la consola", "error"); } finally { btn.disabled = false; btn.innerText = "Guardar"; }
}

// LOGICA DE FECHAS DE MONTAJE PARA CATALOG (COTIZACIÓN RÁPIDA)
window.handleMontajeInput = function(prefix) {
    const val = parseInt(document.getElementById(prefix + '-premontaje').value) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if (val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    if (window.finalMontajeDates.length > val) window.finalMontajeDates = window.finalMontajeDates.slice(0, val);
    window.actualizarLabelMontaje(prefix);
    window.updateQuoteCalculation();
}

window.actualizarLabelMontaje = function(prefix) {
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    if (window.finalMontajeDates.length > 0) {
        lbl.innerText = window.finalMontajeDates.map(d => window.safeFormatDate(d)).join(', ');
        lbl.classList.remove('hidden');
    } else {
        lbl.classList.add('hidden');
    }
}

window.abrirModalMontaje = function(prefix) {
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

window.addMontajeDate = function() {
    const dp = document.getElementById('montaje-date-input');
    const dateVal = dp.value;
    if(!dateVal) return window.showToast("Selecciona una fecha.", "error");
    
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if(window.tempMontajeDates.length >= limit) return window.showToast(`Solo puedes seleccionar ${limit} día(s).`, "error");
    
    if(window.tempMontajeDates.includes(dateVal)) return window.showToast("Esta fecha ya fue agregada.", "error");
    
    const maxD = new Date(dp.max + 'T00:00:00');
    const selD = new Date(dateVal + 'T00:00:00');
    if(selD > maxD) return window.showToast("La fecha debe ser antes del evento.", "error");
    
    window.tempMontajeDates.push(dateVal);
    window.tempMontajeDates.sort();
    window.renderListaMontaje();
}

window.removeMontajeDate = function(idx) {
    window.tempMontajeDates.splice(idx, 1);
    window.renderListaMontaje();
}

window.renderListaMontaje = function() {
    const list = document.getElementById('montaje-dates-list');
    list.innerHTML = '';
    window.tempMontajeDates.forEach((d, i) => {
        list.innerHTML += `<li class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100 shadow-sm"><span class="text-xs font-bold text-gray-700">${window.safeFormatDate(d)}</span><button onclick="window.removeMontajeDate(${i})" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}

window.confirmMontajeDates = function() {
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if(window.tempMontajeDates.length !== limit) return window.showToast(`Debes seleccionar exactamente ${limit} día(s).`, "error");
    
    window.finalMontajeDates = [...window.tempMontajeDates];
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    document.getElementById('montaje-modal').classList.add('hidden');
}


window.openQuoteModal = function(id) {
    currentSpace = allSpaces.find(s => s.id === id); if (!currentSpace) return;
    document.getElementById('q-name').innerText = currentSpace.nombre; document.getElementById('q-key').innerText = currentSpace.clave; document.getElementById('q-price').innerText = "$0.00";
    let modalImg = currentSpace.imagen_url || ''; if(modalImg.startsWith('[')) { try { modalImg = JSON.parse(modalImg)[0]; } catch(e){} } document.getElementById('q-img').src = modalImg; 
    
    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch(e){}
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

    const cliSel = document.getElementById('cli-select'); if(cliSel) cliSel.value=''; const cliId = document.getElementById('cli-id'); if(cliId) cliId.value='';
	loadClientProfilesForQuoteModal(); document.getElementById('avail-msg').classList.add('hidden'); document.getElementById('btn-generate').disabled = true; window.openModal('quote-modal');
}

window.addAdminConcept = function() { const sel = document.getElementById('admin-concept-select'); const id = sel.value; if(!id) return; const concept = catalogConcepts.find(c => c.id == id); if(concept) { adminSelectedConcepts.push({ description: concept.nombre, amount: concept.precio_sugerido, value: concept.precio_sugerido, unit: 'fixed', type: 'aumento' }); window.updateAdminConceptsSummary(); window.updateQuoteCalculation(); } sel.value = ''; }
window.removeAdminConcept = function(index) { adminSelectedConcepts.splice(index, 1); window.updateAdminConceptsSummary(); window.updateQuoteCalculation(); }
window.updateAdminConceptsSummary = function() { const container = document.getElementById('admin-concepts-summary'); container.innerHTML = ''; adminSelectedConcepts.forEach((c, idx) => { container.innerHTML += `<div class="flex justify-between items-center bg-gray-50 border border-gray-100 p-2 rounded text-xs"><span class="font-bold text-gray-700">${c.description}</span><div class="flex items-center gap-3"><span class="font-black text-brand-dark">$${parseFloat(c.amount).toLocaleString()}</span><button onclick="window.removeAdminConcept(${idx})" class="text-gray-400 hover:text-red-500"><i class="fas fa-times"></i></button></div></div>`; }); }

window.updateQuoteCalculation = function() {
    if(!currentSpace) return;
    const s = document.getElementById('date-start').value; const e = document.getElementById('date-end').value; const g = document.getElementById('q-guests').value; 
    let base = 0; if (s && e) { base = calculateDayByDayTotal(currentSpace, s, e, g).total; } 

    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch(ex){}
    const pMontaje = parseFloat(b2b.precio_montaje) || 0; const pHora = parseFloat(b2b.precio_hora_extra) || 0;
    const selOpt = document.getElementById('q-horario').options[document.getElementById('q-horario').selectedIndex];
    const costoHorario = selOpt ? parseFloat(selOpt.getAttribute('data-price')) || 0 : 0;
    const diasM = parseInt(document.getElementById('q-premontaje').value) || 0; const hrsE = parseInt(document.getElementById('q-horas').value) || 0;

    let subtotal = base + costoHorario + (diasM * pMontaje) + (hrsE * pHora);
    adminSelectedConcepts.forEach(c => { subtotal += parseFloat(c.amount); });

    if(currentSpace.ajuste_tipo === 'aumento') subtotal += subtotal * (currentSpace.ajuste_porcentaje/100);
    if(currentSpace.ajuste_tipo === 'descuento') subtotal -= subtotal * (currentSpace.ajuste_porcentaje/100);

    let taxAmt = 0; const sTaxes = parseIds(currentSpace.impuestos_ids);
    if(sTaxes.length && dbTaxes.length) { sTaxes.forEach(tid => { const t = dbTaxes.find(x=>String(x.id)===String(tid)); if(t) { const rate = t.porcentaje > 1 ? t.porcentaje/100 : t.porcentaje; taxAmt += subtotal * rate; } }); }

    currentPricing = { subtotal: subtotal, taxes: taxAmt, final: subtotal + taxAmt };
    document.getElementById('q-price').innerText = formatMoney(currentPricing.final);
}

window.generatePDF = async function() {
    const diasM = parseInt(document.getElementById('q-premontaje').value) || 0;
    if(diasM > 0 && window.finalMontajeDates.length !== diasM) {
        return window.showToast("Faltan asignar las fechas específicas del montaje.", "error");
    }

    const cli = { name: document.getElementById('cli-name').value, rfc: document.getElementById('cli-rfc').value, phone: document.getElementById('cli-phone').value.trim(), email: document.getElementById('cli-email').value.trim() };
    if(!cli.name) return window.showToast("Falta nombre del cliente", "error"); const phoneRegex = /^\d{10}$/; if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");

    window.updateQuoteCalculation(); const guests = parseInt(document.getElementById('q-guests').value) || 1;
    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch(ex){}
    const pMontaje = parseFloat(b2b.precio_montaje) || 0; const pHora = parseFloat(b2b.precio_hora_extra) || 0;
    const selOpt = document.getElementById('q-horario').options[document.getElementById('q-horario').selectedIndex];
    const costoHorario = selOpt ? parseFloat(selOpt.getAttribute('data-price')) || 0 : 0;
    const hrsE = parseInt(document.getElementById('q-horas').value) || 0;

    let conceptosB2B = [];
    if(selOpt) conceptosB2B.push({ description: `Horario: ${selOpt.text}`, amount: costoHorario, value: costoHorario, unit: 'fixed', type: 'b2b_horario', meta: { selected: selOpt.value, custom_name: selOpt.text } });
    if(diasM > 0) conceptosB2B.push({ description: `Montaje extra (${diasM} días)${window.finalMontajeDates.length ? ' - ' + window.finalMontajeDates.map(d=>window.safeFormatDate(d)).join(', ') : ''}`, amount: (diasM * pMontaje), value: (diasM * pMontaje), unit: 'fixed', type: 'b2b_montaje', meta: { days: diasM, unit_price: pMontaje, dates: window.finalMontajeDates } });
    if(hrsE > 0) conceptosB2B.push({ description: `Horas Extras (${hrsE} hrs)`, amount: (hrsE * pHora), value: (hrsE * pHora), unit: 'fixed', type: 'b2b_horas', meta: { hours: hrsE, unit_price: pHora } });
    adminSelectedConcepts.forEach(c => conceptosB2B.push(c));

    const payload = { cliente_id: (document.getElementById('cli-id') ? (document.getElementById('cli-id').value || null) : null), espacio_id: currentSpace.id, espacio_nombre: currentSpace.nombre, espacio_clave: currentSpace.clave, cliente_nombre: cli.name, cliente_rfc: cli.rfc, cliente_contacto: cli.phone, cliente_email: cli.email, fecha_inicio: document.getElementById('date-start').value, fecha_fin: document.getElementById('date-end').value, precio_final: currentPricing.final, desglose_precios: { subtotal_antes_impuestos: currentPricing.subtotal, impuestos_detalle: parseIds(currentSpace.impuestos_ids), tax_total: currentPricing.taxes }, conceptos_adicionales: conceptosB2B, status: 'pendiente', creado_por: (await window.globalSupabase.auth.getUser()).data.user.id, personas: guests };
    
    await window.finSupabase.from('cotizaciones').insert(payload);
    window.showToast("Cotización Creada"); setTimeout(()=>window.location.href='orders.html', 1000); 
}

window.filterCatalogLogic = function() { const term = document.getElementById('cat-search').value.toLowerCase(); const type = document.getElementById('cat-filter-type').value; const sort = document.getElementById('cat-sort').value; let filtered = allSpaces.filter(s => (s.nombre.toLowerCase().includes(term) || s.clave.toLowerCase().includes(term)) && (type === 'all' || s.tipo === type)); if (sort === 'price_asc') filtered.sort((a,b) => a.precio_base - b.precio_base); if (sort === 'price_desc') filtered.sort((a,b) => b.precio_base - a.precio_base); renderSpaces(filtered); }
window.previewImage = function(i){ const p = document.getElementById('mgr-preview'); if(i.files[0]){ const r=new FileReader(); r.onload=e=>{ p.src=e.target.result; p.classList.remove('hidden'); }; r.readAsDataURL(i.files[0]); } }
window.checkAvailability = async function() { const s=document.getElementById('date-start').value, e=document.getElementById('date-end').value; if(!s||!e)return; const {data} = await window.finSupabase.from('cotizaciones').select('id').eq('espacio_id',currentSpace.id).in('status',['aprobada','finalizada']).or(`and(fecha_inicio.lte.${e},fecha_fin.gte.${s})`); const msg=document.getElementById('avail-msg'); msg.classList.remove('hidden'); if(data.length){ msg.innerText='OCUPADO'; msg.className='text-red-500 font-bold text-center'; document.getElementById('btn-generate').disabled=true; }else{ msg.innerText='DISPONIBLE'; msg.className='text-green-600 font-bold text-center'; document.getElementById('btn-generate').disabled=false; } }
window.askDeleteSpace = async function(){ window.openConfirm("¿Eliminar espacio?", async () => { await window.finSupabase.from('espacios').delete().eq('id', document.getElementById('mgr-id').value); window.showToast("Eliminado"); window.closeModal('manager-modal'); loadCatalog(); }); }

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

function __cpSafeArray(v){
    if(!v) return [];
    if(Array.isArray(v)) return v;
    if(typeof v === 'string'){ try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch(e){ return []; } }
    return [];
}
function __cpSafeObject(v){
    if(!v) return {};
    if(typeof v === 'object') return v;
    if(typeof v === 'string'){ try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch(e){ return {}; } }
    return {};
}
function __cpNormalizeDate(v){ const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function __cpTodayISO(){ return new Date().toISOString().split('T')[0]; }
function __cpMonthLabel(year, month){ return new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); }
function __cpDateIsPast(ds){ const d = __cpNormalizeDate(ds); return !!d && d < __cpTodayISO(); }
function __cpAddDays(ds, delta){
    const n = __cpNormalizeDate(ds);
    if(!n) return '';
    const d = new Date(`${n}T00:00:00`);
    d.setDate(d.getDate() + (delta || 0));
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function __cpToYMD(dateObj){
    if(!dateObj) return '';
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function __cpGuestRangeText(space){
    let rules = [];
    try { rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space?.precios_por_dia || []); } catch (e) { rules = []; }
    if (!Array.isArray(rules) || !rules.length) return 'Sin rango';
    const mins = rules.map(r => parseInt(r?.min, 10)).filter(Number.isFinite);
    const maxs = rules.map(r => parseInt(r?.max, 10)).filter(Number.isFinite);
    if (!mins.length || !maxs.length) return 'Sin rango';
    return `${Math.min(...mins)}-${Math.max(...maxs)} pax`;
}
function __cpHorariosText(space){
    const b2b = __cpB2B(space);
    let h = __cpSafeArray(b2b.horarios);
    if(!h.length && b2b.horarios && typeof b2b.horarios === 'object'){
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        h = Object.keys(b2b.horarios).map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end })).filter(item => item.start && item.end);
    }
    if(!h.length) return 'Sin turnos';
    return h.map(x => x.nombre).join(', ');
}
function __cpDatesBetween(startStr, endStr){
    const s = __cpNormalizeDate(startStr), e = __cpNormalizeDate(endStr || startStr);
    if(!s || !e) return [];
    const start = new Date(`${s}T00:00:00`), end = new Date(`${e}T00:00:00`);
    if(Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const out = [];
    for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)){
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        out.push(`${y}-${m}-${day}`);
    }
    return out;
}
function __cpGetSpaceById(spaceId){ return allSpaces.find(s => String(s.id) === String(spaceId)) || null; }
function __cpB2B(space){ return __cpSafeObject(space?.config_b2b); }
function __cpSetQuoteWorkspaceVisible(visible){
    const ws = document.getElementById('quote-workspace');
    const empty = document.getElementById('quote-empty-state');
    if(ws) ws.classList.toggle('hidden', !visible);
    if(empty) empty.classList.toggle('hidden', !!visible);
}
function __cpRefreshSpaceCards(){
    if(typeof window.filterCatalogLogic === 'function') window.filterCatalogLogic();
    else renderSpaces(allSpaces);
}
function __cpDayKey(dateStr){
    const d = new Date(`${dateStr}T00:00:00`);
    if(Number.isNaN(d.getTime())) return '';
    const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return keys[d.getDay()] || '';
}
function __cpIsBlockedDate(space, dateStr, guests){
    const dayKey = __cpDayKey(dateStr);
    let blocked = [];
    try { blocked = typeof space?.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space?.dias_bloqueados || []); } catch(e){ blocked = []; }
    if(Array.isArray(blocked) && blocked.includes(dayKey)) return true;
    const base = calculateDayByDayTotal(space, dateStr, dateStr, guests).total || 0;
    return base <= 0;
}
function __cpCfgHasBlockedDates(cfg){
    const space = __cpGetSpaceById(cfg?.spaceId);
    if(!space) return false;
    const guests = parseInt(cfg?.guests, 10) || 1;
    const eventDates = __cpDatesBetween(cfg?.startDate, cfg?.endDate);
    const premDates = __cpSafeArray(cfg?.premontajeDates).map(__cpNormalizeDate).filter(Boolean);
    return [...eventDates, ...premDates].some(ds => __cpIsBlockedDate(space, ds, guests));
}
function __cpCalcPremCost(space, cfg){
    const requested = Math.max(0, parseInt(cfg.premontajeDays, 10) || 0);
    const dates = __cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean).sort().slice(0, requested);
    const guests = parseInt(cfg.guests, 10) || 1;
    const courtesyDays = Math.min(requested, Math.max(0, parseInt(cfg.premontajeCourtesyDays, 10) || 0));
    cfg.premontajeCourtesyDays = courtesyDays;
    const pct = getPremontajePct();
    const priced = dates.map(ds => ({ date: ds, base_day: parseFloat(calculateDayByDayTotal(space, ds, ds, guests).total || 0) || 0 }));
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
function __cpCreateSpaceCfg(spaceId, seed = {}){
    const space = __cpGetSpaceById(spaceId);
    const b2b = __cpB2B(space);
    const h = __cpSafeArray(b2b.horarios);
    const hasSeedHoraUnit = seed.horasExtraUnit !== undefined && seed.horasExtraUnit !== null && String(seed.horasExtraUnit) !== '';
    return {
        spaceId: String(spaceId),
        startDate: __cpNormalizeDate(seed.startDate || ''),
        endDate: __cpNormalizeDate(seed.endDate || ''),
        guests: parseInt(seed.guests, 10) || 100,
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
        horasExtraUnit: hasSeedHoraUnit ? (parseFloat(seed.horasExtraUnit) || 0) : __cpResolveHoraExtraUnit(space)
    };
}
function __cpGetActiveCfg(){ return __cpQuoteSpaces.find(x => String(x.spaceId) === String(__cpActiveSpaceId)) || null; }
function __cpSaveActiveCfgFromForm(){
    const cfg = __cpGetActiveCfg(); if(!cfg) return;
    cfg.startDate = __cpNormalizeDate(document.getElementById('date-start')?.value || '');
    cfg.endDate = __cpNormalizeDate(document.getElementById('date-end')?.value || '');
    const today = __cpTodayISO();
    if (cfg.startDate && cfg.startDate < today) cfg.startDate = today;
    if (cfg.endDate && cfg.endDate < today) cfg.endDate = today;
    if (cfg.startDate && cfg.endDate && cfg.endDate < cfg.startDate) cfg.endDate = cfg.startDate;
    const startEl = document.getElementById('date-start');
    const endEl = document.getElementById('date-end');
    if (startEl && startEl.value !== cfg.startDate) startEl.value = cfg.startDate || '';
    if (endEl && endEl.value !== cfg.endDate) endEl.value = cfg.endDate || '';
    cfg.guests = parseInt(document.getElementById('q-guests')?.value, 10) || 100;
    cfg.premontajeEnabled = !!document.getElementById('q-chk-premontaje')?.checked;
    cfg.horasExtraEnabled = !!document.getElementById('q-chk-horas')?.checked;
    cfg.premontajeDays = cfg.premontajeEnabled ? (parseInt(document.getElementById('q-premontaje')?.value, 10) || 0) : 0;
    cfg.premontajeCourtesyDays = cfg.premontajeEnabled ? Math.max(0, parseInt(document.getElementById('q-premontaje-cortesia')?.value, 10) || 0) : 0;
    cfg.horasExtra = cfg.horasExtraEnabled ? (parseInt(document.getElementById('q-horas')?.value, 10) || 0) : 0;
    cfg.horasExtraCourtesy = cfg.horasExtraEnabled ? Math.max(0, parseInt(document.getElementById('q-horas-cortesia')?.value, 10) || 0) : 0;
    cfg.horasExtraUnit = __cpResolveHoraExtraUnit(__cpGetSpaceById(cfg.spaceId));
    cfg.premontajeDates = (__cpSafeArray(window.finalMontajeDates) || []).slice(0, cfg.premontajeDays);
    if(cfg.premontajeCourtesyDays > cfg.premontajeDays) cfg.premontajeCourtesyDays = cfg.premontajeDays;
    if(cfg.horasExtraCourtesy > cfg.horasExtra) cfg.horasExtraCourtesy = cfg.horasExtra;
    const pc = document.getElementById('q-premontaje-cortesia');
    const hc = document.getElementById('q-horas-cortesia');
    if (pc) { pc.max = String(cfg.premontajeDays); pc.value = String(cfg.premontajeCourtesyDays); }
    if (hc) { hc.max = String(cfg.horasExtra); hc.value = String(cfg.horasExtraCourtesy); }
    const sel = document.getElementById('q-horario');
    const opt = sel?.options?.[sel.selectedIndex];
    cfg.horarioValue = sel?.value || '';
    cfg.horarioText = opt?.text || '';
    cfg.horarioPrice = parseFloat(opt?.getAttribute('data-price') || 0);
}
function __cpSetHeader(space){
    if(!space) return;
    document.getElementById('q-name').innerText = space.nombre || 'Espacio';
    document.getElementById('q-key').innerText = space.clave || '--';
    let modalImg = space.imagen_url || '';
    if(typeof modalImg === 'string' && modalImg.startsWith('[')){ try { modalImg = JSON.parse(modalImg)[0]; } catch(e){} }
    document.getElementById('q-img').src = modalImg || '../../assets/img/no-image.svg';
}
function __cpRenderHorario(space, selectedValue = ''){
    const b2b = __cpB2B(space);
    let h = __cpSafeArray(b2b.horarios);
    if(!h.length && b2b.horarios && typeof b2b.horarios === 'object'){
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        h = Object.keys(b2b.horarios).map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end, price: b2b.horarios[k]?.price })).filter(item => item.start && item.end);
    }
    const sel = document.getElementById('q-horario');
    sel.innerHTML = '';
    if(h.length) h.forEach(item => { sel.innerHTML += `<option value="${item.nombre}" data-price="${parseFloat(item.price || 0)}">${item.nombre} (${item.start} a ${item.end})</option>`; });
    else sel.innerHTML = '<option value="Sin horario" data-price="0">Sin horario configurado</option>';
    if(selectedValue){
        const found = Array.from(sel.options).find(opt => opt.value === selectedValue);
        if(found) sel.value = selectedValue;
    }
}
function __cpRenderSpaceAddSelect(){
    const sel = document.getElementById('q-space-add');
    if(!sel) return;
    const selectedIds = new Set(__cpQuoteSpaces.map(q => String(q.spaceId)));
    sel.innerHTML = '<option value="">Selecciona espacio...</option>';
    allSpaces.forEach(space => {
        const disabled = selectedIds.has(String(space.id)) ? 'disabled' : '';
        sel.innerHTML += `<option value="${space.id}" ${disabled}>${space.nombre}</option>`;
    });
}
function __cpRenderSpaceTabs(){
    const container = document.getElementById('q-spaces-tabs');
    if(!container) return;
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
function __cpLoadActiveCfgToForm(){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    currentSpace = __cpGetSpaceById(cfg.spaceId);
    __cpSetHeader(currentSpace);
    __cpRenderHorario(currentSpace, cfg.horarioValue);
    document.getElementById('date-start').value = cfg.startDate || '';
    document.getElementById('date-end').value = cfg.endDate || '';
    document.getElementById('q-guests').value = cfg.guests || 100;
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
    window.toggleQuotePremontaje(true);
    window.toggleQuoteHoras(true);
    window.finalMontajeDates = __cpSafeArray(cfg.premontajeDates).slice();
    window.handleMontajeInput('q');
}

function __cpSetDateOnForm(startDate, endDate){
    const start = __cpNormalizeDate(startDate);
    const end = __cpNormalizeDate(endDate || start);
    const minToday = __cpTodayISO();
    if (start && start < minToday) return window.showToast('No puedes seleccionar fechas pasadas.', 'error');
    if (end && end < minToday) return window.showToast('No puedes seleccionar fechas pasadas.', 'error');
    const sEl = document.getElementById('date-start');
    const eEl = document.getElementById('date-end');
    if (sEl) sEl.value = start || '';
    if (eEl) eEl.value = end || '';
    __cpSaveActiveCfgFromForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
}

function __cpDateCellClasses(state, flags){
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

function __cpDayPrice(space, ds, guests){
    const value = calculateDayByDayTotal(space, ds, ds, guests).total;
    return parseFloat(value || 0) || 0;
}

// Renderiza el calendario de fechas del evento con reservas y precios por día.
async function __cpRenderQuoteDatePicker(){
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
window.openQuoteDatePicker = async function(target = 'start'){
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

window.shiftQuoteDatePickerMonth = async function(delta){
    if (!__cpQuotePickerCal) return;
    if ((delta || 0) < 0) __cpQuotePickerCal.prev();
    else __cpQuotePickerCal.next();
}

window.pickQuoteDate = async function(ds){
    if (__cpDateIsPast(ds)) return;
    const cfg = __cpGetActiveCfg();
    const space = __cpGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    if (__CP_DATE_PICKER_STATE.reserved?.has(ds)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} ya está ocupada para este espacio.`, 'error');
    if (space && __cpIsBlockedDate(space, ds, guests)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} está bloqueada para ese espacio.`, 'error');
    const state = __CP_DATE_PICKER_STATE;
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

window.applyQuoteDatePickerSelection = function(){
    const state = __CP_DATE_PICKER_STATE;
    if (!state.start) return window.showToast('Selecciona al menos una fecha.', 'error');
    __cpSetDateOnForm(state.start, state.end || state.start);
    window.closeModal('quote-date-modal');
}
function __cpBuildReservationsMap(rows){
    const map = new Map();
    const addDate = (spaceId, dateStr) => {
        const sid = String(spaceId || '').trim();
        const ds = __cpNormalizeDate(dateStr);
        if(!sid || !ds) return;
        if(!map.has(sid)) map.set(sid, new Set());
        map.get(sid).add(ds);
    };
    const addRange = (spaceId, startStr, endStr) => { __cpDatesBetween(startStr, endStr).forEach(d => addDate(spaceId, d)); };
    const addConceptMontaje = (spaceIdDefault, conceptos) => {
        __cpSafeArray(conceptos).forEach(c => {
            if(String(c?.type || '').toLowerCase().trim() !== 'b2b_montaje') return;
            const meta = __cpSafeObject(c.meta);
            const sid = meta.space_id || spaceIdDefault;
            __cpSafeArray(meta.dates).forEach(d => addDate(sid, d));
        });
    };
    (rows || []).forEach(order => {
        const details = __cpSafeArray(order.espacios_detalle);
        if(details.length){
            details.forEach(item => {
                const sid = item.espacio_id || item.space_id;
                const eventDates = __cpSafeArray(item.fechas_evento).map(__cpNormalizeDate).filter(Boolean);
                if (eventDates.length) eventDates.forEach(d => addDate(sid, d));
                else addRange(sid, item.fecha_inicio, item.fecha_fin);
                __cpSafeArray(item.premontaje_fechas).forEach(d => addDate(sid, d));
                addConceptMontaje(sid, item.conceptos_adicionales);
            });
        } else if(order.espacio_id){
            addRange(order.espacio_id, order.fecha_inicio, order.fecha_fin);
            addConceptMontaje(order.espacio_id, order.conceptos_adicionales);
        }
    });
    return map;
}
async function __cpGetReservations(force = false){
    const now = Date.now();
    if(!force && __cpReservationsCache && (now - __cpReservationsAt <= __CP_RESERVATION_CACHE_MS)) return __cpReservationsCache;
    let rows = [];
    let query = await window.finSupabase.from('cotizaciones').select('id,status,espacio_id,fecha_inicio,fecha_fin,conceptos_adicionales,espacios_detalle').in('status', __CP_RESERVATION_STATUSES);
    if(query.error){
        const fallback = await window.finSupabase.from('cotizaciones').select('id,status,espacio_id,fecha_inicio,fecha_fin,conceptos_adicionales').in('status', __CP_RESERVATION_STATUSES);
        if(!fallback.error) rows = fallback.data || [];
    } else {
        rows = query.data || [];
    }
    __cpReservationsCache = __cpBuildReservationsMap(rows);
    __cpReservationsAt = now;
    return __cpReservationsCache;
}
async function __cpEvalAvailability(force = false){
    const map = await __cpGetReservations(force);
    const bySpace = {};
    __cpQuoteSpaces.forEach(cfg => {
        const sid = String(cfg.spaceId);
        const reserved = map.get(sid) || new Set();
        const needed = [...__cpDatesBetween(cfg.startDate, cfg.endDate), ...__cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean)];
        const conflicts = needed.filter(d => reserved.has(d));
        bySpace[sid] = { available: conflicts.length === 0, conflicts };
    });
    return bySpace;
}

window.selectQuoteSpace = function(spaceId){
    __cpSaveActiveCfgFromForm();
    __cpActiveSpaceId = String(spaceId);
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
    __cpRefreshSpaceCards();
}
window.addSpaceToQuote = function(){
    const sel = document.getElementById('q-space-add');
    const newId = sel?.value;
    if(!newId || __cpQuoteSpaces.some(x => String(x.spaceId) === String(newId))) return;
    __cpSaveActiveCfgFromForm();
    const active = __cpGetActiveCfg();
    const seed = active ? { startDate: active.startDate, endDate: active.endDate, guests: active.guests } : {};
    __cpQuoteSpaces.push(__cpCreateSpaceCfg(newId, seed));
    __cpActiveSpaceId = String(newId);
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
    __cpRefreshSpaceCards();
}
window.removeQuoteSpaceFromQuote = function(spaceId){
    if(__cpQuoteSpaces.length <= 1) return;
    __cpSaveActiveCfgFromForm();
    __cpQuoteSpaces = __cpQuoteSpaces.filter(x => String(x.spaceId) !== String(spaceId));
    if(String(__cpActiveSpaceId) === String(spaceId) && __cpQuoteSpaces.length) __cpActiveSpaceId = String(__cpQuoteSpaces[0].spaceId);
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
    __cpRefreshSpaceCards();
}

window.toggleQuotePremontaje = function(skipSync){
    const enabled = !!document.getElementById('q-chk-premontaje')?.checked;
    const days = document.getElementById('q-premontaje');
    const courtesy = document.getElementById('q-premontaje-cortesia');
    const btn = document.getElementById('q-btn-montaje');
    const box = document.getElementById('q-premontaje-fields');
    if(box) box.classList.toggle('hidden', !enabled);
    if(days) days.disabled = !enabled;
    if(courtesy) courtesy.disabled = !enabled;
    if(courtesy) courtesy.max = String(Math.max(0, parseInt(days?.value, 10) || 0));
    if(!enabled){
        if(days) days.value = 0;
        if(courtesy) courtesy.value = 0;
        window.finalMontajeDates = [];
        if(btn) btn.classList.add('hidden');
    }
    if(enabled && !skipSync) window.handleMontajeInput('q');
    window.actualizarLabelMontaje('q');
    if (!skipSync) {
        __cpSaveActiveCfgFromForm();
        window.updateQuoteCalculation();
        window.checkAvailability();
    }
}

window.toggleQuoteHoras = function(skipSync){
    const enabled = !!document.getElementById('q-chk-horas')?.checked;
    const hours = document.getElementById('q-horas');
    const courtesy = document.getElementById('q-horas-cortesia');
    const box = document.getElementById('q-horas-fields');
    if(box) box.classList.toggle('hidden', !enabled);
    if(hours) hours.disabled = !enabled;
    if(courtesy) courtesy.disabled = !enabled;
    if(courtesy) courtesy.max = String(Math.max(0, parseInt(hours?.value, 10) || 0));
    if(!enabled){
        if(hours) hours.value = 0;
        if(courtesy) courtesy.value = 0;
    }
    if (!skipSync) {
        __cpSaveActiveCfgFromForm();
        window.updateQuoteCalculation();
        window.checkAvailability();
    }
}

window.handleMontajeInput = function(prefix){
    const cfg = __cpGetActiveCfg(); if(!cfg) return;
    const premEnabled = !!document.getElementById('q-chk-premontaje')?.checked;
    if(!premEnabled){
        document.getElementById(prefix + '-premontaje').value = 0;
    }
    const val = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if(val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    cfg.premontajeDays = val;
    cfg.premontajeDates = __cpSafeArray(cfg.premontajeDates).slice(0, val);
    const courtesyInput = document.getElementById(prefix + '-premontaje-cortesia');
    const courtesyVal = Math.max(0, parseInt(courtesyInput?.value, 10) || 0);
    if(courtesyInput) courtesyInput.max = String(val);
    cfg.premontajeCourtesyDays = Math.min(courtesyVal, val);
    if(courtesyInput) courtesyInput.value = cfg.premontajeCourtesyDays;
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(prefix);
    window.updateQuoteCalculation();
    window.checkAvailability();
}
window.actualizarLabelMontaje = function(prefix){
    const cfg = __cpGetActiveCfg();
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    const dates = __cpSafeArray(cfg?.premontajeDates || []);
    if(dates.length > 0){ lbl.innerText = dates.map(d => window.safeFormatDate(d)).join(', '); lbl.classList.remove('hidden'); }
    else lbl.classList.add('hidden');
}
function __cpIsMontajeUnavailable(ds, cfg, space, guests){
    const state = __CP_MONTAJE_PICKER_STATE;
    const isPast = __cpDateIsPast(ds);
    const overLimit = !!state.maxDate && ds > state.maxDate;
    const isReserved = state.reserved?.has(ds);
    const isBlocked = !isPast && !isReserved && !!space && __cpIsBlockedDate(space, ds, guests);
    return { isPast, overLimit, isReserved, isBlocked, disabled: isPast || overLimit || isReserved || isBlocked };
}

// Renderiza calendario de premontaje con costos ya ajustados al porcentaje configurado.
async function __cpRenderMontajeDatePicker(){
    const grid = document.getElementById('montaje-fc') || document.getElementById('montaje-date-grid');
    if(!grid) return;
    const cfg = __cpGetActiveCfg();
    const space = __cpGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    const state = __CP_MONTAJE_PICKER_STATE;

    const label = document.getElementById('montaje-month-label');
    const startLbl = document.getElementById('montaje-picked-start');
    const endLbl = document.getElementById('montaje-picked-end');
    if(label) label.textContent = '';
    if(startLbl) startLbl.textContent = state.start ? window.safeFormatDate(state.start) : '--';
    if(endLbl) endLbl.textContent = state.end ? window.safeFormatDate(state.end) : '--';

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
                const base = __cpDayPrice(space, ds, guests);
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
    if(list){
        const rows = Array.from(state.reserved || new Set())
            .filter(d => d >= __cpTodayISO() && (!state.maxDate || d <= state.maxDate))
            .sort()
            .slice(0, 45);
        list.innerHTML = rows.length
            ? rows.map(d => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join('')
            : '<p class="text-[10px] text-gray-400 italic">Sin reservas confirmadas visibles.</p>';
    }
}

window.abrirModalMontaje = async function(prefix){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    window.currentMontajePrefix = prefix;
    const requiredDays = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    if(requiredDays <= 0) return window.showToast("Ingresa la cantidad de días primero.", "error");
    if(!cfg.startDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");

    const maxD = new Date(`${cfg.startDate}T00:00:00`);
    maxD.setDate(maxD.getDate() - 1);
    const maxDate = maxD.toISOString().split('T')[0];
    if(maxDate < __cpTodayISO()) return window.showToast("Ya no hay días válidos de premontaje antes del evento.", "error");

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
    if(limitEl) limitEl.textContent = String(requiredDays);
    document.getElementById('montaje-modal').classList.remove('hidden');
    await __cpRenderMontajeDatePicker();
    __cpRefreshCalendarLayout(__cpMontajePickerCal);
}

window.shiftMontajePickerMonth = async function(delta){
    if (!__cpMontajePickerCal) return;
    if ((delta || 0) < 0) __cpMontajePickerCal.prev();
    else __cpMontajePickerCal.next();
}

window.pickMontajeDate = async function(ds){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    const space = __cpGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const flags = __cpIsMontajeUnavailable(ds, cfg, space, guests);
    if(flags.disabled) return;
    const state = __CP_MONTAJE_PICKER_STATE;
    if(!state.start || state.end){
        state.start = ds;
        state.end = '';
    } else if(ds < state.start){
        state.start = ds;
    } else {
        const range = __cpDatesBetween(state.start, ds);
        const bad = range.find(dateStr => __cpIsMontajeUnavailable(dateStr, cfg, space, guests).disabled);
        if(bad) return window.showToast(`El rango incluye una fecha no disponible: ${window.safeFormatDate(bad)}.`, "error");
        state.end = ds;
    }
    await __cpRenderMontajeDatePicker();
}

window.applyMontajeDatePickerSelection = async function(){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    const state = __CP_MONTAJE_PICKER_STATE;
    if(!state.start) return window.showToast("Selecciona al menos una fecha.", "error");
    const requiredDays = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value, 10) || 0;
    const range = __cpDatesBetween(state.start, state.end || state.start);
    if(requiredDays > 0 && range.length !== requiredDays) return window.showToast(`Debes seleccionar exactamente ${requiredDays} día(s).`, "error");
    const space = __cpGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const bad = range.find(ds => __cpIsMontajeUnavailable(ds, cfg, space, guests).disabled);
    if(bad) return window.showToast(`La fecha ${window.safeFormatDate(bad)} no está disponible.`, "error");

    cfg.premontajeDates = range.slice();
    window.tempMontajeDates = range.slice();
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    document.getElementById('montaje-modal').classList.add('hidden');
    window.updateQuoteCalculation();
    await window.checkAvailability();
}

const __oldLoadCatalog = loadCatalog;
loadCatalog = async function(){
    await __oldLoadCatalog();
    if (IS_QUOTE_PAGE) __cpRenderSpaceAddSelect();
};

function __cpResetQuoteWorkspaceForm(){
    adminSelectedConcepts = [];
    window.updateAdminConceptsSummary();
    document.getElementById('q-price').innerText = '$0.00';
    const quoteName = document.getElementById('q-quote-name');
    if (quoteName) quoteName.value = '';
    document.getElementById('cli-name').value = '';
    document.getElementById('cli-rfc').value = '';
    document.getElementById('cli-phone').value = '';
    document.getElementById('cli-email').value = '';
    const cliSel = document.getElementById('cli-select'); if(cliSel) cliSel.value = '';
    const cliId = document.getElementById('cli-id'); if(cliId) cliId.value = '';
    loadClientProfilesForQuoteModal();
    document.getElementById('avail-msg').classList.add('hidden');
    document.getElementById('btn-generate').disabled = true;
}

function __cpSyncQuoteWorkspaceUI(){
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    if(__cpQuoteSpaces.length){
        __cpLoadActiveCfgToForm();
        __cpSetQuoteWorkspaceVisible(true);
        window.updateQuoteCalculation();
        window.checkAvailability();
    } else {
        currentSpace = null;
        __cpSetQuoteWorkspaceVisible(false);
        document.getElementById('q-price').innerText = '$0.00';
        const msg = document.getElementById('avail-msg');
        if(msg) msg.classList.add('hidden');
        const btn = document.getElementById('btn-generate');
        if(btn) btn.disabled = true;
    }
    __cpRefreshSpaceCards();
}

window.toggleQuoteSpaceCard = function(spaceId){
    if (!IS_QUOTE_PAGE) {
        window.location.href = `cotizacion.html?space=${encodeURIComponent(spaceId)}`;
        return;
    }
    const sid = String(spaceId);
    const space = __cpGetSpaceById(sid);
    if(!space) return;
    __cpSaveActiveCfgFromForm();

    const selConcept = document.getElementById('admin-concept-select');
    if(selConcept){
        selConcept.innerHTML = '<option value="">Selecciona servicio...</option>';
        catalogConcepts.forEach(c => { selConcept.innerHTML += `<option value="${c.id}">${c.nombre} (+$${c.precio_sugerido})</option>`; });
    }

    const exists = __cpQuoteSpaces.some(x => String(x.spaceId) === sid);
    if(!__cpQuoteSpaces.length){
        __cpQuoteSpaces = [__cpCreateSpaceCfg(sid)];
        __cpActiveSpaceId = sid;
        currentSpace = space;
        __cpResetQuoteWorkspaceForm();
        __cpSyncQuoteWorkspaceUI();
        return;
    }
    if(!exists){
        const active = __cpGetActiveCfg();
        const seed = active ? { startDate: active.startDate, endDate: active.endDate, guests: active.guests } : {};
        __cpQuoteSpaces.push(__cpCreateSpaceCfg(sid, seed));
    }
    __cpActiveSpaceId = sid;
    currentSpace = space;
    __cpSyncQuoteWorkspaceUI();
}

window.powerOffQuoteSpace = function(spaceId){
    if (!IS_QUOTE_PAGE) return;
    const sid = String(spaceId);
    const exists = __cpQuoteSpaces.some(x => String(x.spaceId) === sid);
    if(!exists) return;
    __cpSaveActiveCfgFromForm();
    __cpQuoteSpaces = __cpQuoteSpaces.filter(x => String(x.spaceId) !== sid);
    if(!__cpQuoteSpaces.length){
        __cpActiveSpaceId = null;
        window.finalMontajeDates = [];
        __cpSyncQuoteWorkspaceUI();
        return;
    }
    if(String(__cpActiveSpaceId) === sid) __cpActiveSpaceId = String(__cpQuoteSpaces[0].spaceId);
    __cpSyncQuoteWorkspaceUI();
}

window.openQuoteModal = function(id){
    window.toggleQuoteSpaceCard(id);
};

window.updateQuoteCalculation = function(){
    __cpSaveActiveCfgFromForm();
    const spacesPricing = [];
    let subtotal = 0, taxesTotal = 0;
    __cpQuoteSpaces.forEach(cfg => {
        const space = __cpGetSpaceById(cfg.spaceId);
        if(!space) return;
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
            if(space.ajuste_tipo === 'aumento') subSpace += subSpace * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
            if(space.ajuste_tipo === 'descuento') subSpace -= subSpace * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
        }
        let spaceTaxTotal = 0;
        const taxIds = parseIds(space.impuestos_ids);
        taxIds.forEach(tid => { const t = dbTaxes.find(x => String(x.id) === String(tid)); if(t){ const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0); spaceTaxTotal += subSpace * rate; } });
        subtotal += subSpace; taxesTotal += spaceTaxTotal;
        spacesPricing.push({ spaceId: space.id, spaceName: space.nombre, spaceKey: space.clave, startDate: cfg.startDate, endDate: cfg.endDate, guests, maxCapacity, capacityOk, blockedOk, horarioValue: cfg.horarioValue, horarioText: cfg.horarioText || cfg.horarioValue || '', horarioCost, premontajeDays: parseInt(cfg.premontajeDays, 10) || 0, premontajeCourtesyDays: parseInt(cfg.premontajeCourtesyDays, 10) || 0, premontajeDates: __cpSafeArray(cfg.premontajeDates), premontajeCost: prem.total, premontajeBreakdown: prem.breakdown, horasExtra: extraHours, horasExtraCourtesy: courtesyHours, horasExtraBillable: billableHours, horasExtraUnit: horaUnit, horasExtraCost: horasCost, subtotalBeforeTax: subSpace, taxIds, taxTotal: spaceTaxTotal });
    });
    let adminConceptTotal = 0; adminSelectedConcepts.forEach(c => { adminConceptTotal += parseFloat(c.amount || 0); });
    subtotal += adminConceptTotal;
    if (adminConceptTotal > 0 && spacesPricing.length > 0) {
        const firstTaxes = spacesPricing[0].taxIds || [];
        firstTaxes.forEach(tid => {
            const t = dbTaxes.find(x => String(x.id) === String(tid));
            if (!t) return;
            const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0);
            taxesTotal += adminConceptTotal * rate;
        });
    }
    currentPricing = { subtotal, taxes: taxesTotal, final: subtotal + taxesTotal, spaces: spacesPricing, adminConceptTotal };
    document.getElementById('q-price').innerText = formatMoney(currentPricing.final);
}

window.checkAvailability = async function(){
    __cpSaveActiveCfgFromForm();
    const msg = document.getElementById('avail-msg');
    const btn = document.getElementById('btn-generate');
    const activeCfg = __cpGetActiveCfg();
    if(!activeCfg){ btn.disabled = true; msg.classList.add('hidden'); return; }
    const today = __cpTodayISO();
    const allRequired = __cpQuoteSpaces.every(cfg => { if(!cfg.startDate || !cfg.endDate) return false; const pm = parseInt(cfg.premontajeDays, 10) || 0; return pm === 0 || (__cpSafeArray(cfg.premontajeDates).length === pm); });
    const invalidPast = __cpQuoteSpaces.find(cfg => {
        if (!cfg.startDate || !cfg.endDate) return false;
        return cfg.startDate < today || cfg.endDate < today;
    });
    const invalidCapacity = __cpQuoteSpaces.find(cfg => {
        const sp = __cpGetSpaceById(cfg.spaceId);
        if (!sp) return true;
        const maxCap = getSpaceMaxCapacity(sp);
        const guests = parseInt(cfg.guests, 10) || 0;
        return (maxCap < 999999 && guests > maxCap);
    });
    const invalidBlocked = __cpQuoteSpaces.find(cfg => __cpCfgHasBlockedDates(cfg));
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

window.generatePDF = async function(){
    __cpSaveActiveCfgFromForm();
    window.updateQuoteCalculation();
    await window.checkAvailability();
    const today = __cpTodayISO();
    const allRequired = __cpQuoteSpaces.every(cfg => { if(!cfg.startDate || !cfg.endDate) return false; const pm = parseInt(cfg.premontajeDays, 10) || 0; return pm === 0 || (__cpSafeArray(cfg.premontajeDates).length === pm); });
    if(!allRequired) return window.showToast("Completa fechas y premontajes de todos los espacios.", "error");
    const invalidPastCfg = __cpQuoteSpaces.find(cfg => cfg.startDate < today || cfg.endDate < today);
    if (invalidPastCfg) {
        const sp = __cpGetSpaceById(invalidPastCfg.spaceId);
        return window.showToast(`No se permiten fechas pasadas en ${sp?.nombre || invalidPastCfg.spaceId}.`, "error");
    }
    const availability = await __cpEvalAvailability(true);
    const allAvailable = __cpQuoteSpaces.every(cfg => availability[String(cfg.spaceId)]?.available !== false);
    if(!allAvailable) {
        const conflictCfg = __cpQuoteSpaces.find(cfg => availability[String(cfg.spaceId)]?.available === false);
        const sp = __cpGetSpaceById(conflictCfg?.spaceId);
        const firstConflict = availability[String(conflictCfg?.spaceId)]?.conflicts?.[0];
        return window.showToast(`${sp?.nombre || conflictCfg?.spaceId} está ocupado ${firstConflict ? '(' + window.safeFormatDate(firstConflict) + ')' : ''}.`, "error");
    }
    const spaces = currentPricing.spaces || [];
    const invalidCapacity = spaces.find(sp => sp.capacityOk === false);
    if(invalidCapacity) return window.showToast(`El aforo para ${invalidCapacity.spaceName} excede su capacidad máxima.`, "error");
    const invalidBlocked = spaces.find(sp => sp.blockedOk === false);
    if(invalidBlocked) return window.showToast(`La selección para ${invalidBlocked.spaceName} incluye días bloqueados.`, "error");
    const cli = { name: document.getElementById('cli-name').value, rfc: document.getElementById('cli-rfc').value, phone: document.getElementById('cli-phone').value.trim(), email: document.getElementById('cli-email').value.trim() };
    if(!cli.name) return window.showToast("Falta nombre del cliente", "error");
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");
    if(!spaces.length) return window.showToast("No hay espacios configurados.", "error");
    const quoteNameInput = document.getElementById('q-quote-name');
    const quoteNameRaw = (quoteNameInput?.value || '').trim();
    const quoteName = quoteNameRaw || `${cli.name} - ${spaces.map(s => s.spaceName).join(' + ')}`;

    const conceptosB2B = [];
    const espaciosDetalle = spaces.map(sp => {
        if(sp.horarioText){
            conceptosB2B.push({ description: `[${sp.spaceName}] - Horario (${sp.horarioText})`, amount: sp.horarioCost, value: sp.horarioCost, unit: 'fixed', type: 'b2b_horario', meta: { space_id: sp.spaceId, selected: sp.horarioValue, custom_name: sp.horarioText } });
        }
        if(sp.premontajeDays > 0){
            const courtesy = parseInt(sp.premontajeCourtesyDays, 10) || 0;
            const requestedDays = parseInt(sp.premontajeDays, 10) || 0;
            const courtesyPart = courtesy > 0 ? `, cortesia: ${courtesy}` : '';
            conceptosB2B.push({ description: `[${sp.spaceName}] - Premontaje (dias: ${requestedDays}${courtesyPart})`, amount: sp.premontajeCost, value: sp.premontajeCost, unit: 'fixed', type: 'b2b_montaje', meta: { space_id: sp.spaceId, days: sp.premontajeDays, courtesy_days: courtesy, dates: sp.premontajeDates, percentage: getPremontajePct(), per_day_base: sp.premontajeBreakdown } });
        }
        if(sp.horasExtra > 0){
            const rawHours = parseInt(sp.horasExtra, 10) || 0;
            const courtesyHours = parseInt(sp.horasExtraCourtesy, 10) || 0;
            const courtesyHoursPart = courtesyHours > 0 ? `, cortesia: ${courtesyHours}` : '';
            conceptosB2B.push({ description: `[${sp.spaceName}] - Horas extra (hrs: ${rawHours}${courtesyHoursPart})`, amount: sp.horasExtraCost, value: sp.horasExtraCost, unit: 'fixed', type: 'b2b_horas', meta: { space_id: sp.spaceId, hours: sp.horasExtraBillable, raw_hours: sp.horasExtra, courtesy_hours: sp.horasExtraCourtesy, unit_price: sp.horasExtraUnit } });
        }
        return { espacio_id: sp.spaceId, espacio_nombre: sp.spaceName, espacio_clave: sp.spaceKey, fecha_inicio: sp.startDate, fecha_fin: sp.endDate, personas: sp.guests, horario: { value: sp.horarioValue, label: sp.horarioText, amount: sp.horarioCost }, fechas_evento: __cpDatesBetween(sp.startDate, sp.endDate), premontaje_dias: sp.premontajeDays, premontaje_cortesia_dias: sp.premontajeCourtesyDays || 0, premontaje_fechas: sp.premontajeDates, premontaje_total: sp.premontajeCost, premontaje_detalle: sp.premontajeBreakdown, horas_extra: sp.horasExtra, horas_extra_cortesia: sp.horasExtraCourtesy || 0, horas_extra_facturables: sp.horasExtraBillable || 0, horas_extra_unitario: sp.horasExtraUnit, horas_extra_total: sp.horasExtraCost, subtotal_espacio: sp.subtotalBeforeTax, impuestos_ids: sp.taxIds, impuestos_total: sp.taxTotal };
    });
    adminSelectedConcepts.forEach(c => conceptosB2B.push(c));

    const first = spaces[0];
    const startDates = spaces.map(s => s.startDate).filter(Boolean).sort();
    const endDates = spaces.map(s => s.endDate).filter(Boolean).sort();
    const minStart = startDates[0] || '';
    const maxEnd = endDates[endDates.length - 1] || '';
    const maxGuests = Math.max(...spaces.map(s => parseInt(s.guests, 10) || 0), 0);
    const taxIdsUnion = Array.from(new Set(spaces.flatMap(s => s.taxIds || []).map(x => String(x))));
    const payload = { cliente_id: (document.getElementById('cli-id') ? (document.getElementById('cli-id').value || null) : null), nombre_cotizacion: quoteName, espacio_id: first.spaceId, espacio_nombre: spaces.length === 1 ? first.spaceName : `${first.spaceName} + ${spaces.length - 1} espacio(s)`, espacio_clave: spaces.length === 1 ? first.spaceKey : 'MULTI', cliente_nombre: cli.name, cliente_rfc: cli.rfc, cliente_contacto: cli.phone, cliente_email: cli.email, fecha_inicio: minStart, fecha_fin: maxEnd, precio_final: currentPricing.final, desglose_precios: { subtotal_antes_impuestos: currentPricing.subtotal, impuestos_detalle: taxIdsUnion, tax_total: currentPricing.taxes, espacios: espaciosDetalle }, detalles_evento: { multi_espacio: spaces.length > 1, total_espacios: spaces.length, nombre_cotizacion: quoteName }, espacios_detalle: espaciosDetalle, conceptos_adicionales: conceptosB2B, status: 'pendiente', creado_por: (await window.globalSupabase.auth.getUser()).data.user.id, personas: maxGuests || 1 };
    const { error } = await window.finSupabase.from('cotizaciones').insert(payload);
    if(error){
        console.error(error);
        if (String(error.message || '').toLowerCase().includes('espacios_detalle')) {
            return window.showToast('Falta aplicar migración de BD para multi-espacio.', 'error');
        }
        return window.showToast(`Error al guardar: ${error.message}`, "error");
    }
    __cpReservationsCache = null; __cpReservationsAt = 0;
    window.showToast("Cotización Creada");
    setTimeout(()=>window.location.href='orders.html', 1000);
}

