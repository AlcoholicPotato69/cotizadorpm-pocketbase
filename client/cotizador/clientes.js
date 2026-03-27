/**
 * DOC: client\cotizador\clientes.js
 * Proposito: Gestion de clientes y relacion con cotizaciones.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE CLIENTES (PERFILES + HISTORIAL DE COTIZACIONES)
// =========================================================================

const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';

let allClients = [];
let canManage = false;
let clientHistoryRows = [];
let activeHistoryClient = null;

function normalizeRoleName(value='') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'administrador' || raw === 'superadmin' || raw === 'super_admin') return 'admin';
  return raw;
}

function deriveClientAccessFromLayout() {
  const authCtx = window.__HUB_AUTH_CONTEXT || null;
  if (!authCtx?.session?.user) return null;
  const perms = (authCtx.permissions && typeof authCtx.permissions === 'object') ? authCtx.permissions : {};
  return {
    role: normalizeRoleName(authCtx.role || authCtx.profile?.role || ''),
    perms,
    canView: true,
    canManage: authCtx.isAdmin === true || perms.clients_manage === true
  };
}

async function fetchClientAccessContext(sessionUser) {
  const fromLayout = deriveClientAccessFromLayout();
  if (fromLayout) return fromLayout;

  const lookupOne = async (table, field, value) => {
    if (!value || !window.globalPocketBase) return null;
    try {
      const { data, error } = await window.globalPocketBase.from(table).select('*').eq(field, value).maybeSingle();
      if (!error && data) return data;
    } catch (_) {}
    return null;
  };

  const userId = String(sessionUser?.id || '').trim();
  const userEmail = String(sessionUser?.email || '').trim().toLowerCase();
  let appUser = await lookupOne('app_users', 'id', userId);
  if (!appUser) appUser = await lookupOne('app_users', 'email', userEmail);

  const role = normalizeRoleName(
    appUser?.role
    || sessionUser?.role
    || sessionUser?.rol
    || ''
  );
  const roleHasAccess = role === 'admin' || role === 'plaza_mayor' || role === 'ambos';
  const roleDefaultPerms = {
    clients_view: true,
    clients_manage: true,
    orders_view: true,
    reports_view: true
  };
  const rawPerms =
    (appUser?.app_metadata?.finanzas?.permissions && typeof appUser.app_metadata.finanzas.permissions === 'object')
      ? appUser.app_metadata.finanzas.permissions
      : {};
  const perms = (role === 'admin' || roleHasAccess) ? roleDefaultPerms : rawPerms;
  const canView = (role === 'admin') || roleHasAccess
    || perms.clients_view === true
    || perms.clients_manage === true
    || perms.orders_view === true
    || perms.catalog_manage === true
    || perms.reports_view === true
    || perms.access !== false;
  const canManageResolved = (role === 'admin') || roleHasAccess || perms.clients_manage === true;

  return { role, perms, canView, canManage: canManageResolved };
}

function escapeHTML(str='') {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function normalize(str='') { return String(str).toLowerCase().trim(); }
function formatMoney(v){ return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(v || 0) || 0); }
function safeArray(v){
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch(e){ return []; }
  }
  return [];
}
function safeDate(v){
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '--';
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function buildClientQuoteFolio(row) {
  const current = String(row?.numero_orden || '').trim();
  if (current) return current.toUpperCase();
  const rawId = String(row?.id || '').trim().toUpperCase();
  return rawId ? `PM-${rawId.slice(0, 6)}` : 'PM-PEND';
}

function normalizePdfNoteDocType(value='') {
  const raw = normalize(value);
  if (['cotizacion', 'cotización', 'quote', 'borrador', 'draft_quote'].includes(raw)) return 'cotizacion';
  if (['orden', 'order', 'orden_compra', 'purchase_order', 'orden de compra'].includes(raw)) return 'orden';
  if (['recibo', 'receipt', 'recibos', 'constancia', 'constancia_liquidacion', 'constancia de liquidacion'].includes(raw)) return 'recibo';
  if (['contrato', 'contract'].includes(raw)) return 'contrato';
  if (['factura', 'invoice', 'xml', 'factura_pdf', 'factura_xml'].includes(raw)) return 'factura';
  return raw;
}

function getQuotePdfNotes(row, docType) {
  return [];
}

function formatPdfNoteDate(value='') {
  const stamp = String(value || '').trim();
  if (!stamp) return 'Sin fecha registrada';
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return stamp;
  return parsed.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function openClientPdfNotesModal(row, docType, docLabel) {
  window.showToast?.("El sistema de notas está deshabilitado.", "info");
}

function showEmptyIfNeeded() {
  const grid = document.getElementById('clients-grid');
  const empty = document.getElementById('clients-empty');
  if (!grid || !empty) return;
  const hasCards = grid.querySelectorAll('[data-client-card]').length > 0;
  empty.classList.toggle('hidden', hasCards);
}

// Render principal de tarjetas de cliente.
function renderClients(list) {
  const grid = document.getElementById('clients-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!Array.isArray(list) || !list.length) {
    showEmptyIfNeeded();
    return;
  }

  list.forEach(c => {
    const name = escapeHTML(c.nombre_completo || '');
    const phone = escapeHTML(c.telefono || '');
    const email = escapeHTML(c.correo || '');
    const rfc = escapeHTML(c.rfc || '');

    const actions = canManage ? `
      <div class="flex gap-2">
        <button class="btn-edit bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
        <button class="btn-del bg-brand-red/10 hover:bg-brand-red/20 text-brand-red font-black text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
          <i class="fa-solid fa-trash"></i> Eliminar
        </button>
      </div>
    ` : `
      <div class="text-[11px] text-gray-400 font-semibold uppercase">Solo lectura</div>
    `;

    const card = document.createElement('div');
    card.setAttribute('data-client-card', '1');
    card.className = "bg-white rounded-2xl shadow-md border border-gray-100 p-4 hover:shadow-lg transition cursor-pointer";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-black text-sm text-gray-800 truncate">${name || '—'}</h3>
          <p class="text-[11px] text-gray-500 mt-0.5 uppercase font-bold">Perfil de cliente</p>
        </div>
        <span class="w-9 h-9 rounded-2xl bg-brand-red text-white flex items-center justify-center shadow">
          <i class="fa-solid fa-user"></i>
        </span>
      </div>

      <div class="mt-4 space-y-2 text-sm">
        <div class="flex items-center gap-2 text-gray-700">
          <i class="fa-solid fa-phone text-gray-400 w-4"></i>
          <span class="text-xs font-semibold">${phone || '—'}</span>
        </div>
        <div class="flex items-center gap-2 text-gray-700">
          <i class="fa-solid fa-envelope text-gray-400 w-4"></i>
          <span class="text-xs font-semibold break-all">${email || '—'}</span>
        </div>
        <div class="flex items-center gap-2 text-gray-700">
          <i class="fa-solid fa-file-lines text-gray-400 w-4"></i>
          <span class="text-xs font-semibold">${rfc || '—'}</span>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between">
        ${actions}
      </div>
    `;

    // Click en tarjeta abre historial de reservaciones/cotizaciones.
    card.addEventListener('click', () => openClientHistory(c));

    if (canManage) {
      card.querySelector('.btn-edit')?.addEventListener('click', (ev) => { ev.stopPropagation(); openClientModal(c); });
      card.querySelector('.btn-del')?.addEventListener('click', (ev) => { ev.stopPropagation(); confirmDeleteClient(c); });
    }

    grid.appendChild(card);
  });

  showEmptyIfNeeded();
}

async function loadClients() {
  try {
    const { data, error } = await window.tenantPocketBase.from('clientes')
      .select('id,nombre_completo,telefono,correo,rfc,created_at,updated_at')
      .order('nombre_completo', { ascending: true });

    if (error) throw error;
    allClients = data || [];
    applySearch();
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudieron cargar los clientes. (¿Ya ejecutaste el SQL?)", "error");
    allClients = [];
    applySearch();
  }
}

function applySearch() {
  const q = normalize(document.getElementById('clients-search')?.value || '');
  if (!q) return renderClients(allClients);

  const filtered = allClients.filter(c => {
    const blob = [c.nombre_completo, c.telefono, c.correo, c.rfc].map(v => normalize(v || '')).join(' ');
    return blob.includes(q);
  });

  renderClients(filtered);
}

function openClientModal(client=null) {
  if (!canManage) return window.showToast?.("No tienes permisos para administrar clientes.", "error");

  const idEl = document.getElementById('client-id');
  const nameEl = document.getElementById('client-name');
  const phoneEl = document.getElementById('client-phone');
  const emailEl = document.getElementById('client-email');
  const rfcEl = document.getElementById('client-rfc');
  const title = document.getElementById('client-modal-title');
  if (!idEl || !nameEl || !phoneEl || !emailEl || !rfcEl) return;

  idEl.value = client?.id || '';
  nameEl.value = client?.nombre_completo || '';
  phoneEl.value = client?.telefono || '';
  emailEl.value = client?.correo || '';
  rfcEl.value = client?.rfc || '';
  if (title) title.innerText = client?.id ? "Editar Cliente" : "Nuevo Cliente";
  window.openModal?.('client-modal');
}

function closeClientModal() { window.closeModal?.('client-modal'); }

function confirmModal(text) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    const txt = document.getElementById('confirm-text');
    const ok = document.getElementById('btn-confirm-ok');
    const cancel = document.getElementById('btn-confirm-cancel');

    if (!modal || !txt || !ok || !cancel) return resolve(false);
    txt.textContent = text || '¿Confirmar?';
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const cleanup = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      ok.onclick = null;
      cancel.onclick = null;
    };

    ok.onclick = () => { cleanup(); resolve(true); };
    cancel.onclick = () => { cleanup(); resolve(false); };
  });
}

async function confirmDeleteClient(client) {
  const ok = await confirmModal(`¿Eliminar el cliente "${client?.nombre_completo || ''}"? Esta acción no se puede deshacer.`);
  if (!ok) return;
  try {
    const { error } = await window.tenantPocketBase.from('clientes').delete().eq('id', client.id);
    if (error) throw error;
    window.showToast?.("Cliente eliminado", "success");
    await loadClients();
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudo eliminar el cliente.", "error");
  }
}

async function openClientStoredDocument(path) {
  if (!path) return window.showToast?.("Documento no disponible.", "error");
  try {
    const { data, error } = await window.globalPocketBase.storage.from('documentos').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw (error || new Error('No se pudo firmar URL'));
    window.open(data.signedUrl, '_blank');
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudo abrir el documento.", "error");
  }
}

function renderClientHistoryRows(rows) {
  const tbody = document.getElementById('client-history-list');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400 font-semibold">No hay cotizaciones vinculadas para este cliente.</td></tr>';
    return;
  }
  rows.forEach(o => {
    const folio = buildClientQuoteFolio(o);
    const qName = (o.nombre_cotizacion || o.detalles_evento?.nombre_cotizacion || '').trim();
    const dateLabel = (o.fecha_inicio && o.fecha_fin)
      ? (o.fecha_inicio === o.fecha_fin ? safeDate(o.fecha_inicio) : `${safeDate(o.fecha_inicio)} - ${safeDate(o.fecha_fin)}`)
      : '--';
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';
    tr.innerHTML = `
      <td class="p-3 font-black text-brand-dark">${folio}</td>
      <td class="p-3">
        <span class="font-bold text-gray-800 block">${qName || 'Sin nombre'}</span>
        <span class="text-[10px] text-gray-500 uppercase font-bold">${(o.status || 'pendiente')}</span>
      </td>
      <td class="p-3">
        <span class="font-bold text-gray-700 block">${o.espacio_nombre || '--'}</span>
        <span class="text-[10px] text-gray-500 font-mono">${dateLabel}</span>
      </td>
      <td class="p-3 text-right font-bold">${formatMoney(o.precio_final)}</td>
      <td class="p-3 text-center">
        <button class="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase">Expediente</button>
      </td>
    `;
    tr.querySelector('button')?.addEventListener('click', () => openClientQuoteDocs(o.id));
    tbody.appendChild(tr);
  });
}

function createQuoteDocButton(container, label, icon, action, muted=false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-stretch gap-2';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = muted
    ? 'flex-1 text-left px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 text-gray-400 flex items-center gap-3'
    : 'flex-1 text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm bg-white';
  btn.innerHTML = `<i class="${icon} text-brand-red w-4"></i><span class="text-xs font-bold">${label}</span>`;
  if (!muted) btn.addEventListener('click', action);
  wrapper.appendChild(btn);
  container.appendChild(wrapper);
}


async function fetchLatestClientQuoteRow(quoteId) {
  const cols = 'id,numero_orden,nombre_cotizacion,detalles_evento,cliente_id,cliente_nombre,cliente_email,espacio_nombre,fecha_inicio,fecha_fin,precio_final,status,created_at,url_cotizacion_final,url_orden_compra,contrato_url,factura_pdf_url,factura_xml_url,historial_pagos';
  try {
    const { data, error } = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('id', quoteId).maybeSingle();
    if (!error && data) return data;
  } catch (_) {}
  return clientHistoryRows.find(x => x.id === quoteId) || null;
}

async function openClientQuoteDocs(quoteId) {
  const row = await fetchLatestClientQuoteRow(quoteId);
  if (!row) return window.showToast?.("No se encontró la cotización.", "error");
  const title = document.getElementById('qdocs-title');
  const sub = document.getElementById('qdocs-sub');
  const list = document.getElementById('client-quote-docs-list');
  if (!title || !sub || !list) return;

  const folio = buildClientQuoteFolio(row);
  title.innerText = `Expediente #${folio}`;
  sub.innerText = `${row.cliente_nombre || ''} • ${row.espacio_nombre || '--'}`;
  list.innerHTML = '';

  if (row.url_cotizacion_final) createQuoteDocButton(list, 'Ver Cotización Aprobada', 'fa-solid fa-file-circle-check', () => openClientStoredDocument(row.url_cotizacion_final));
  else createQuoteDocButton(list, 'Cotización aprobada no disponible', 'fa-solid fa-file-pen', () => {}, true);

  if (row.url_orden_compra) createQuoteDocButton(list, 'Ver Orden de Compra', 'fa-solid fa-file-contract', () => openClientStoredDocument(row.url_orden_compra));
  else createQuoteDocButton(list, 'Orden de compra no disponible', 'fa-solid fa-file-contract', () => {}, true);

  if (row.contrato_url) createQuoteDocButton(list, 'Ver Contrato', 'fa-solid fa-file-signature', () => openClientStoredDocument(row.contrato_url));
  else createQuoteDocButton(list, 'Contrato no disponible', 'fa-solid fa-signature', () => {}, true);

  if (row.factura_pdf_url) createQuoteDocButton(list, 'Ver Factura PDF', 'fa-solid fa-file-pdf', () => openClientStoredDocument(row.factura_pdf_url));
  else createQuoteDocButton(list, 'Factura PDF no disponible', 'fa-solid fa-file-invoice-dollar', () => {}, true);

  if (row.factura_xml_url) createQuoteDocButton(list, 'Descargar XML', 'fa-solid fa-file-code', () => openClientStoredDocument(row.factura_xml_url));

  const pagos = safeArray(row.historial_pagos);
  if (pagos.length) {
    const divider = document.createElement('div');
    divider.className = 'text-[10px] font-black uppercase text-gray-400 px-1 pt-2';
    divider.innerText = 'Recibos';
      list.appendChild(divider);
      pagos.forEach((p, i) => {
        const pth = p?.file_path || p?.path || '';
      if (pth) createQuoteDocButton(list, `Recibo #${i + 1}`, 'fa-solid fa-receipt', () => openClientStoredDocument(pth));
    });
  } else {
    createQuoteDocButton(list, 'Recibos no disponibles', 'fa-solid fa-receipt', () => {}, true);
  }

  createQuoteDocButton(list, 'Abrir en módulo de cotizaciones', 'fa-solid fa-arrow-up-right-from-square', () => {
    window.location.href = `orders.html?quote=${encodeURIComponent(row.id)}`;
  });

  window.openModal?.('client-quote-docs-modal');
}

async function openClientHistory(client) {
  activeHistoryClient = client;
  const nameEl = document.getElementById('history-client-name');
  const phoneEl = document.getElementById('history-client-phone');
  const emailEl = document.getElementById('history-client-email');
  const subEl = document.getElementById('history-client-sub');
  if (nameEl) nameEl.innerText = client?.nombre_completo || '--';
  if (phoneEl) phoneEl.innerText = client?.telefono || '--';
  if (emailEl) emailEl.innerText = client?.correo || '--';
  if (subEl) subEl.innerText = 'Cargando cotizaciones...';
  clientHistoryRows = [];
  renderClientHistoryRows([]);
  window.openModal?.('client-history-modal');

  const cols = 'id,numero_orden,nombre_cotizacion,detalles_evento,cliente_id,cliente_nombre,cliente_email,espacio_nombre,fecha_inicio,fecha_fin,precio_final,status,created_at,url_cotizacion_final,url_orden_compra,contrato_url,factura_pdf_url,factura_xml_url,historial_pagos';
  const merged = new Map();
  const mergeRows = (arr=[]) => arr.forEach(r => { if (r?.id) merged.set(r.id, r); });
  try {
    const qById = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('cliente_id', client.id).order('created_at', { ascending: false }).limit(20);
    if (!qById.error) mergeRows(qById.data || []);
    if (client?.correo) {
      const qByMail = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('cliente_email', client.correo).order('created_at', { ascending: false }).limit(20);
      if (!qByMail.error) mergeRows(qByMail.data || []);
    }
    if (client?.nombre_completo) {
      const qByName = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('cliente_nombre', client.nombre_completo).order('created_at', { ascending: false }).limit(20);
      if (!qByName.error) mergeRows(qByName.data || []);
    }
    clientHistoryRows = Array.from(merged.values()).sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderClientHistoryRows(clientHistoryRows);
    if (subEl) subEl.innerText = `${clientHistoryRows.length} cotización(es) encontrada(s).`;
  } catch (e) {
    console.error(e);
    if (subEl) subEl.innerText = 'No se pudo cargar historial.';
    window.showToast?.("No se pudo cargar historial de cotizaciones.", "error");
  }
}

async function saveClient() {
  if (!canManage) return window.showToast?.("No tienes permisos para administrar clientes.", "error");

  const id = (document.getElementById('client-id')?.value || '').trim();
  const nombre = (document.getElementById('client-name')?.value || '').trim();
  const telefono = (document.getElementById('client-phone')?.value || '').replace(/\D/g,'').trim();
  const correo = (document.getElementById('client-email')?.value || '').trim();
  const rfc = (document.getElementById('client-rfc')?.value || '').trim().toUpperCase();
  if (!nombre) return window.showToast?.("Falta el nombre completo.", "error");
  if (telefono && telefono.length !== 10) return window.showToast?.("El teléfono debe tener 10 dígitos.", "error");
  if (correo) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) return window.showToast?.("Correo inválido.", "error");
  }

  const payload = { nombre_completo: nombre, telefono: telefono || null, correo: correo || null, rfc: rfc || null };
  try {
    const btn = document.getElementById('btn-save-client');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }
    if (id) {
      const { error } = await window.tenantPocketBase.from('clientes').update(payload).eq('id', id);
      if (error) throw error;
      window.showToast?.("Cliente actualizado", "success");
    } else {
      const { error } = await window.tenantPocketBase.from('clientes').insert(payload);
      if (error) throw error;
      window.showToast?.("Cliente creado", "success");
    }
    closeClientModal();
    await loadClients();
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudo guardar el cliente. (¿Ya ejecutaste el SQL?)", "error");
  } finally {
    const btn = document.getElementById('btn-save-client');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar'; }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
    try { await window.__HUB_LAYOUT_READY; } catch (_) {}
  }
  if (window.__HUB_PAGE_ACCESS_DENIED) return;
  if (!window.PB_CLIENT) return;
  if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
  if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);

  const authState = await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
  const session = authState?.session || null;
  if (!session?.user) {
    window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
    return;
  }

  const accessCtx = await fetchClientAccessContext(session.user);
  const role = accessCtx.role;
  const perms = accessCtx.perms || {};
  canManage = accessCtx.canManage === true;
  if (!accessCtx.canView) {
    window.showToast?.('No tienes permisos para acceder a Clientes.', 'error');
    return;
  }

  if (role !== 'admin') {
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

  const btnNew = document.getElementById('btn-new-client');
  if (btnNew) {
    if (!canManage) btnNew.classList.add('hidden');
    btnNew.addEventListener('click', () => openClientModal(null));
  }

  document.getElementById('clients-search')?.addEventListener('input', applySearch);
  document.getElementById('btn-save-client')?.addEventListener('click', saveClient);
  await loadClients();
});







