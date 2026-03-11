/**
 * DOC: client\cotizador\contracts.js
 * Proposito: Gestion de contratos vinculados a cotizaciones aprobadas.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE CONTRATOS - (FINAL: CORRECCIÓN DE CARGA Y ERRORES)
// =========================================================================

// --- 0. FUNCIONES GLOBALES ---
window.safeFormatDate = function(dateStr) { 
    if (!dateStr) return '--'; 
    const parts = dateStr.split('-'); 
    if (parts.length !== 3) return dateStr; 
    return `${parts[2]}/${parts[1]}/${parts[0]}`; 
};

window.formatDate = function(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    if(isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('es-MX', {day:'2-digit', month:'2-digit', year:'numeric'});
};

window.formatMoney = function(v){ 
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); 
};

window.showToast = function(msg, type='success') { 
    const c = document.getElementById('toast-container'); 
    if(!c) return;
    const e = document.createElement('div'); 
    e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type==='error'?'bg-red-500':'bg-green-500'}`; 
    e.innerText = msg; 
    c.appendChild(e); 
    setTimeout(() => e.remove(), 3000); 
};

window.openModal = function(id) { 
    const el = document.getElementById(id);
    if(el) { el.classList.remove('hidden'); el.classList.add('flex'); }
};

window.closeModal = function(id) { 
    const el = document.getElementById(id);
    if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
};

let confirmCallback = null;
window.openCustomConfirm = function(msg, callback) {
    const titleEl = document.getElementById('confirm-title');
    if(titleEl) titleEl.innerText = msg;
    confirmCallback = callback;
    window.openModal('generic-confirm-modal');
};

// --- LOGICA DE TABS SINCRONIZADA ---
window.switchTab = function(tab) { 
    if(tab === 'receipt') { 
        document.getElementById('tab-btn-receipt').classList.add('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-receipt').classList.remove('border-transparent','text-gray-500'); 
        document.getElementById('tab-btn-contract').classList.remove('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-contract').classList.add('border-transparent','text-gray-500'); 
        
        document.getElementById('view-receipt').classList.remove('hidden');
        document.getElementById('view-contract').classList.add('hidden');
        
        document.getElementById('sidebar-receipt').classList.remove('hidden');
        document.getElementById('sidebar-receipt').classList.add('flex');
        document.getElementById('sidebar-contract').classList.add('hidden');
        document.getElementById('sidebar-contract').classList.remove('flex');
        
        setTimeout(window.adjustPreviewScale, 50);
        
    } else { 
        document.getElementById('tab-btn-contract').classList.add('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-contract').classList.remove('border-transparent','text-gray-500'); 
        document.getElementById('tab-btn-receipt').classList.remove('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-receipt').classList.add('border-transparent','text-gray-500'); 
        
        document.getElementById('view-contract').classList.remove('hidden');
        document.getElementById('view-receipt').classList.add('hidden');
        
        document.getElementById('sidebar-contract').classList.remove('hidden');
        document.getElementById('sidebar-contract').classList.add('flex');
        document.getElementById('sidebar-receipt').classList.add('hidden');
        document.getElementById('sidebar-receipt').classList.remove('flex');
        
        setTimeout(window.adjustPreviewScale, 50);
    } 
};

// --- ESCALADO OPTIMIZADO ---
window.adjustPreviewScale = function() {
    const receiptVisible = !document.getElementById('view-receipt').classList.contains('hidden');
    const container = receiptVisible ? document.getElementById('receipt-preview-container') : document.getElementById('contract-preview-container');
    const box = receiptVisible ? document.getElementById('receipt-preview-box') : document.getElementById('contract-preview-box');

    if (!container || !box) return;

    // Calcular ancho disponible
    const availableWidth = container.clientWidth - 80; // Restamos padding
    const docWidth = 816; // Ancho carta fijo
    
    let scale = availableWidth / docWidth;
    
    // Límites de seguridad
    if (scale > 1.5) scale = 1.5; 
    if (scale < 0.4) scale = 0.4;
    
    box.style.transform = `scale(${scale})`;
    
    // Ajustar margen inferior para el scroll
    const docHeight = 1056; 
    const scaledHeight = docHeight * scale;
    const heightDifference = scaledHeight - docHeight;
    box.style.marginBottom = `${heightDifference + 50}px`;
};

// --- AISLAMIENTO DE PLANTILLAS (EVITA QUE CSS DE LA PLANTILLA AFECTE LA APP) ---
function setContractPreviewSrcdoc(rawHtml) {
    const iframe = document.getElementById('contract-preview-iframe');
    if (!iframe) return;

    const baseHref = new URL('./', window.location.href).href;
    const headInject =
        `<base href="${baseHref}">` +
        `<meta charset="utf-8">` +
        `<style>
            html, body { margin:0; padding:0; background:#fff; font-family:'Segoe UI', Arial, sans-serif; }
            .var-highlight { font-weight:800; background-color:#fef08a; padding:0 2px; border-radius:2px; }
        </style>`;

    let html = rawHtml || '<p style="font-family:Segoe UI, Arial, sans-serif; padding:24px; color:#6b7280; font-weight:700;">Sin plantilla cargada.</p>';

    if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head[\s>][^>]*>/i, (m) => m + headInject);
    } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html[\s>][^>]*>/i, (m) => m + `<head>${headInject}</head>`);
    } else {
        html = `<!doctype html><html><head>${headInject}</head><body>${html}</body></html>`;
    }

    iframe.srcdoc = html;
}

window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(window.adjustPreviewScale, 100);
});

window.openStoredReceipt = async function(filePath) { 
    window.showToast("Abriendo...", "info"); 
    const { data, error } = await window.globalSupabase.storage.from('documentos').createSignedUrl(filePath, 3600); 
    if (error || !data) { window.showToast("Error archivo", "error"); return; } 
    window.open(data.signedUrl, '_blank'); 
};

window.handleSignedFile = function(input) { 
    if(input.files[0]) { 
        signedFileToUpload = input.files[0]; 
        document.getElementById('lbl-signed-file').innerText = input.files[0].name; 
        document.getElementById('btn-confirm-finalize').disabled=false; 
        document.getElementById('btn-confirm-finalize').classList.remove('bg-gray-300','cursor-not-allowed'); 
        document.getElementById('btn-confirm-finalize').classList.add('bg-green-600'); 
    } 
};

// --- CONFIGURACIÓN ---
/* -------------------------------------------------------------------------
 * 0. CONEXIÓN A BASE DE DATOS (ÚNICO LUGAR A CAMBIAR)
 * ------------------------------------------------------------------------- */
const SB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseUrl) || 'http://127.0.0.1:54321';
const SB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseAnonKey) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// (Opcional) Esquema finanzas configurable
const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
const LOGO_URL = (window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl)
  || ((window.HUB_CONFIG && window.HUB_CONFIG.supabaseUrl)
      ? (window.HUB_CONFIG.supabaseUrl + '/storage/v1/object/public/espacios/logo.png')
      : '');
const TEMPLATE_BUCKET = 'documentos';
const TEMPLATE_PATH = 'templates_contratos';

const AVAILABLE_VARS = [
    { key: '{{CLIENTE}}', desc: 'Nombre del Cliente' },
    { key: '{{RFC}}', desc: 'RFC del Cliente' },
    { key: '{{TELEFONO}}', desc: 'Teléfono' },
    { key: '{{EMAIL}}', desc: 'Email' },
    { key: '{{ESPACIO}}', desc: 'Nombre del Espacio' },
    { key: '{{CLAVE}}', desc: 'Clave de Espacio' },
    { key: '{{FECHA_INICIO}}', desc: 'Fecha Inicio' },
    { key: '{{FECHA_FIN}}', desc: 'Fecha Fin' },
    { key: '{{MONTO_TOTAL}}', desc: 'Precio Final' },
    { key: '{{FECHA_HOY}}', desc: 'Fecha Actual' },
    { key: '{{NUM_ORDEN}}', desc: 'Folio Orden' },
    { key: '{{NUM_CONTRATO}}', desc: 'Folio Contrato' }
];

let approvedOrders = [], selectedOrder = null, templates = [], signedFileToUpload = null, externalReceiptFile = null;
let currentRemainingBalance = 0;
let pendingAction = null;

// --- INICIALIZACIÓN SEGURA ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar librerías
    if (typeof window.supabase === 'undefined') {
        alert("Error crítico: No se pudo cargar la librería de conexión. Revisa tu internet o los bloqueadores de anuncios.");
        return;
    }

    // 2. Inicializar Clientes
    if(!window.finSupabase) window.finSupabase = window.supabase.createClient(SB_URL, SB_KEY, { db: { schema: FIN_SCHEMA } });
    if(!window.globalSupabase) window.globalSupabase = window.supabase.createClient(SB_URL, SB_KEY);

    // 3. Verificar Sesión
    const { data: { session } } = await window.globalSupabase.auth.getSession();
    if (!session) window.location.href = 'index.html';

    console.log("Sistema iniciado correctamente. Cargando módulos...");

    // 4. Cargar Datos
    await loadApprovedOrders();
    
    setContractPreviewSrcdoc(null);
window.loadTemplatesList(); 
    renderVariablesCheatSheet();

    // Filtros
    document.getElementById('search-approved').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        renderOrderList(approvedOrders.filter(o => o.cliente_nombre.toLowerCase().includes(term) || (o.numero_orden && o.numero_orden.toLowerCase().includes(term))));
    });
    
    // Modal Confirm
    const btnConf = document.getElementById('btn-confirm-action');
    if(btnConf) {
        btnConf.addEventListener('click', () => {
            if(confirmCallback) confirmCallback();
            window.closeModal('generic-confirm-modal');
        });
    }
});

async function loadApprovedOrders() {
    const listContainer = document.getElementById('approved-list');
    if(!listContainer) return;
    
    listContainer.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">Cargando...</div>';
    
    try {
        console.log("Solicitando órdenes aprobadas...");
        const { data, error } = await window.finSupabase
            .from('cotizaciones')
            .select('*')
            .eq('status', 'aprobada')
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`Órdenes cargadas: ${data?.length || 0}`);
        approvedOrders = data || [];
        renderOrderList(approvedOrders);

    } catch (e) {
        console.error("Error al cargar órdenes:", e);
        listContainer.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">Error de conexión: ${e.message}</div>`;
    }
}

function renderOrderList(list) {
    const container = document.getElementById('approved-list'); 
    container.innerHTML = '';
    
    if (!list || list.length === 0) { 
        container.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">No hay órdenes pendientes de contrato.</div>'; 
        return; 
    }
    
    list.forEach(o => {
        const item = document.createElement('div');
        item.className = 'bg-white border border-gray-100 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition group shadow-sm mb-2';
        item.onclick = () => selectOrder(o);
        item.innerHTML = `<div class="flex justify-between mb-1"><span class="font-bold text-xs text-gray-800 group-hover:text-brand-red transition truncate w-32">${o.cliente_nombre}</span><span class="text-[9px] font-mono text-gray-400 bg-gray-50 border border-gray-200 px-1 rounded">${o.numero_orden || '---'}</span></div><div class="flex justify-between items-center"><span class="text-[10px] text-gray-500 truncate w-24"><i class="fa-solid fa-map-pin mr-1"></i>${o.espacio_nombre}</span><span class="text-xs font-black text-gray-800">${formatMoney(o.precio_final)}</span></div>`;
        container.appendChild(item);
    });
}

function selectOrder(order) {
    selectedOrder = order;
    
    // UI Updates
    document.getElementById('workspace-empty').classList.add('hidden');
    document.getElementById('wk-header').classList.remove('hidden');
    document.getElementById('wk-header').classList.add('flex');
    document.getElementById('wk-tabs').classList.remove('hidden');
    document.getElementById('wk-content').classList.remove('hidden');
    document.getElementById('sidebar-empty').classList.add('hidden');
    
    // Data Binding
    document.getElementById('wk-client-name').innerText = order.cliente_nombre;
    document.getElementById('wk-order-id').innerText = order.numero_orden || 'PENDIENTE';
    document.getElementById('wk-total').innerText = formatMoney(order.precio_final);
    document.getElementById('rcp-ref').value = order.numero_orden || `ORD-${order.id.slice(0,6).toUpperCase()}`;
    
    // GESTIÓN DE BOTONES Y ESTADOS DE CONTRATO
    const cNumInput = document.getElementById('contract-num-assign');
    const cSaveBtn = document.getElementById('btn-save-contract-num');
    const btnFinalize = document.getElementById('btn-open-finalize');

    // Estado inicial de "Guardar y Finalizar": SIEMPRE DESHABILITADO al cargar
    btnFinalize.disabled = true;
    btnFinalize.classList.add('bg-gray-300', 'cursor-not-allowed');
    btnFinalize.classList.remove('bg-green-600', 'hover:bg-green-700', 'shadow-lg');

    // Lógica para input de Número de Contrato
    if (order.numero_contrato) {
        cNumInput.value = order.numero_contrato;
        cNumInput.disabled = true; // Bloquear si ya tiene número
        cSaveBtn.disabled = true;
        cSaveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        cNumInput.value = '';
        cNumInput.disabled = false;
        cSaveBtn.disabled = false;
        cSaveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // Calculations Recibos
    const history = order.historial_pagos || [];
    const totalPaid = history.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    currentRemainingBalance = Math.round((parseFloat(order.precio_final) - totalPaid) * 100) / 100;
    if (currentRemainingBalance < 0) currentRemainingBalance = 0;

    const nextPaymentNum = history.length + 1;
    document.getElementById('rcp-concept').value = `Pago ${nextPaymentNum} / ${order.espacio_nombre}`;
    
    const amountInput = document.getElementById('rcp-amount');
    const btnGen = document.getElementById('btn-gen-receipt');
    const statusMsg = document.getElementById('payment-status-message');

    // Estado Liquidada (Recibos)
    if (currentRemainingBalance <= 0.1) {
        amountInput.value = '0.00';
        amountInput.disabled = true;
        amountInput.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        
        btnGen.disabled = false;
        btnGen.classList.remove('bg-gray-400', 'cursor-not-allowed', 'bg-brand-dark', 'hover:bg-black');
        btnGen.classList.add('bg-green-600', 'hover:bg-green-700');
        btnGen.innerHTML = '<i class="fa-solid fa-print"></i> Descargar Constancia';
        
        statusMsg.classList.remove('hidden');
    } else {
        amountInput.value = currentRemainingBalance.toFixed(2);
        amountInput.disabled = false;
        amountInput.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        
        btnGen.disabled = false;
        btnGen.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-gray-400', 'cursor-not-allowed');
        btnGen.classList.add('bg-brand-dark', 'hover:bg-black');
        btnGen.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Generar y Guardar';
        
        statusMsg.classList.add('hidden');
    }

    renderPaymentHistory(history);
    switchTab('receipt'); 
    
    updateReceiptPreview();
    setTimeout(window.adjustPreviewScale, 100);
}

// NUEVA FUNCIÓN: GUARDAR SOLO EL NÚMERO DE CONTRATO
window.saveContractNumber = function() {
    if(!selectedOrder) return;
    const val = document.getElementById('contract-num-assign').value.trim();
    if(!val) return window.showToast("Escribe un número de contrato", "error");

    window.openCustomConfirm("¿Confirmar Número de Contrato? Una vez guardado, NO se podrá modificar y se actualizarán los documentos.", async () => {
        try {
            // Actualizar BD
            const { error } = await window.finSupabase
                .from('cotizaciones')
                .update({ numero_contrato: val })
                .eq('id', selectedOrder.id);
            
            if(error) throw error;

            // Actualizar objeto local
            selectedOrder.numero_contrato = val;
            window.showToast("Número de contrato guardado", "success");

            // Bloquear UI
            document.getElementById('contract-num-assign').disabled = true;
            document.getElementById('btn-save-contract-num').disabled = true;
            document.getElementById('btn-save-contract-num').classList.add('opacity-50', 'cursor-not-allowed');

            // Si hay plantilla seleccionada, recargarla para mostrar el nuevo número
            if(document.getElementById('template-selector').value) {
                window.loadSelectedTemplate();
            }

        } catch(e) {
            console.error(e);
            window.showToast("Error al guardar: " + e.message, "error");
        }
    });
};

function renderPaymentHistory(history) {
    const container = document.getElementById('payments-history-list'); container.innerHTML = '';
    if(!history || history.length === 0) { container.innerHTML = '<p class="text-[10px] text-gray-400 italic text-center py-2">Sin pagos registrados.</p>'; return; }
    history.forEach((pay, idx) => {
        const div = document.createElement('div'); div.className = "flex justify-between items-center bg-white p-2 rounded border border-gray-100 text-[10px]";
        const viewBtn = pay.file_path ? `<button onclick="window.openStoredReceipt('${pay.file_path}')" class="text-blue-500 hover:text-blue-700 font-bold ml-2 cursor-pointer" title="Ver PDF"><i class="fa-solid fa-file-pdf"></i></button>` : '';
        const delBtn = `<button onclick="window.deleteReceipt(${idx})" class="text-gray-400 hover:text-red-500 ml-2" title="Eliminar"><i class="fa-solid fa-trash"></i></button>`;
        div.innerHTML = `<div><span class="font-bold text-gray-700">#${idx+1} - ${new Date(pay.date).toLocaleDateString()}</span><span class="block text-gray-400 truncate w-32">${pay.concept}</span></div><div class="flex items-center"><span class="font-mono font-bold">${formatMoney(pay.amount)}</span>${viewBtn}${delBtn}</div>`;
        container.appendChild(div);
    });
}

function validateRequiredData() {
    if(!selectedOrder) return false;
    const missing = [];
    if(!selectedOrder.cliente_contacto) missing.push({id:'miss-phone', label:'Teléfono de Contacto', db:'cliente_contacto'});
    if(!selectedOrder.cliente_email) missing.push({id:'miss-email', label:'Correo Electrónico', db:'cliente_email'});
    const rfc = selectedOrder.cliente_rfc || (selectedOrder.datos_fiscales ? selectedOrder.datos_fiscales.rfc_receptor : null);
    if(!rfc) missing.push({id:'miss-rfc', label:'RFC del Cliente', db:'cliente_rfc'});

    if(missing.length > 0) {
        const container = document.getElementById('missing-fields-container');
        container.innerHTML = '';
        missing.forEach(f => {
            container.innerHTML += `<div><label class="text-[10px] font-bold uppercase text-gray-500">${f.label}</label><input id="${f.id}" data-db="${f.db}" class="w-full border border-gray-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-brand-red"></div>`;
        });
        window.openModal('missing-data-modal');
        return false;
    }
    return true;
}

window.saveMissingData = async function() {
    const inputs = document.querySelectorAll('#missing-fields-container input');
    const updates = {};
    let valid = true;
    inputs.forEach(i => { if(!i.value) valid = false; updates[i.dataset.db] = i.value; });
    if(!valid) return window.showToast("Completa todos los campos", "error");
    if(updates.cliente_rfc) { updates.datos_fiscales = { ...selectedOrder.datos_fiscales, rfc_receptor: updates.cliente_rfc }; }
    try {
        const { error } = await window.finSupabase.from('cotizaciones').update(updates).eq('id', selectedOrder.id);
        if(error) throw error;
        window.showToast("Datos guardados", "success");
        window.closeModal('missing-data-modal');
        Object.assign(selectedOrder, updates);
        if(pendingAction === 'receipt') window.generateAndSaveReceipt();
        else if(pendingAction === 'finalize') window.confirmFinalize();
        pendingAction = null;
    } catch(e) { window.showToast("Error al guardar: " + e.message, "error"); }
}

window.updateReceiptPreview = function() {
    if(!selectedOrder) return;
    let amount = parseFloat(document.getElementById('rcp-amount').value);
    if(isNaN(amount)) amount = 0;
    if (currentRemainingBalance > 0.01) {
        if (amount > currentRemainingBalance + 0.01) { 
            amount = currentRemainingBalance;
            document.getElementById('rcp-amount').value = amount.toFixed(2);
            window.showToast("Monto ajustado al máximo permitido.", "warning");
        }
    } else {
        amount = 0; 
        document.getElementById('rcp-amount').value = "0.00";
    }
    document.getElementById('receipt-preview-box').innerHTML = getReceiptHTML(true);
    const remaining = currentRemainingBalance - amount;
    document.getElementById('lbl-remaining').innerText = formatMoney(remaining < 0 ? 0 : remaining);
    window.adjustPreviewScale();
}

window.downloadReceiptPDF = async function() { 
    const hiddenContainer = document.getElementById('receipt-pdf-render'); 
    hiddenContainer.innerHTML = getReceiptHTML(true); 
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    const element = hiddenContainer.firstElementChild; 
    const opt = { margin: 0, filename: currentRemainingBalance <= 0.01 ? `Constancia_Liquidacion_${selectedOrder.numero_orden}.pdf` : `Recibo_${selectedOrder.numero_orden}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().set(opt).from(element).save().then(() => hiddenContainer.innerHTML = ''); 
}

window.generateAndSaveReceipt = async function() {
    if(!selectedOrder) return;
    if (currentRemainingBalance <= 0.01) { window.downloadReceiptPDF(); return; }
    const amount = parseFloat(document.getElementById('rcp-amount').value);
    if (amount <= 0) return window.showToast("El monto debe ser mayor a 0.", "error");
    pendingAction = 'receipt';
    if(!validateRequiredData()) return;
    const btn = document.getElementById('btn-gen-receipt');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    try {
        const hiddenContainer = document.getElementById('receipt-pdf-render');
        hiddenContainer.innerHTML = getReceiptHTML(false); 
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        const element = hiddenContainer.firstElementChild;
        const fileName = `Recibo_${selectedOrder.numero_orden}_${Date.now()}.pdf`;
        const pdfBlob = await html2pdf().set({ margin: 0, filename: fileName, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(element).output('blob');
        hiddenContainer.innerHTML = '';
        const filePath = `${selectedOrder.id}/recibos/${fileName}`;
        const { error: upErr } = await window.globalSupabase.storage.from('documentos').upload(filePath, pdfBlob);
        if(upErr) throw upErr;
        const newPayment = { date: new Date().toISOString(), amount: amount, concept: document.getElementById('rcp-concept').value, reference: document.getElementById('rcp-ref').value, bank: document.getElementById('rcp-bank').value, account: document.getElementById('rcp-account').value, file_path: filePath };
        const updatedHistory = [...(selectedOrder.historial_pagos || []), newPayment];
        const { error: dbErr } = await window.finSupabase.from('cotizaciones').update({ historial_pagos: updatedHistory }).eq('id', selectedOrder.id);
        if(dbErr) throw dbErr;
        window.showToast("Recibo generado", "success");
        const link = document.createElement('a'); link.href = URL.createObjectURL(pdfBlob); link.download = fileName; link.click();
        loadApprovedOrders(); selectedOrder.historial_pagos = updatedHistory; selectOrder(selectedOrder);
    } catch (e) { console.error(e); window.showToast("Error: " + e.message, "error"); } 
    finally { if (currentRemainingBalance > 0.01) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Generar y Guardar'; } }
}

window.deleteReceipt = function(index) {
    window.openCustomConfirm("¿Eliminar este recibo? El saldo aumentará.", async () => {
        try {
            const history = [...selectedOrder.historial_pagos];
            const item = history[index];
            if(item.file_path) await window.globalSupabase.storage.from('documentos').remove([item.file_path]);
            history.splice(index, 1);
            await window.finSupabase.from('cotizaciones').update({ historial_pagos: history }).eq('id', selectedOrder.id);
            window.showToast("Recibo eliminado");
            loadApprovedOrders();
            selectedOrder.historial_pagos = history;
            selectOrder(selectedOrder);
        } catch(e) { window.showToast("Error al eliminar", "error"); }
    });
}

window.openTemplateManager = () => window.openModal('templates-modal');
window.loadTemplatesList = async function() { const c = document.getElementById('templates-list-container'); const s = document.getElementById('template-selector'); if(!c || !s) return; const { data } = await window.globalSupabase.storage.from(TEMPLATE_BUCKET).list(TEMPLATE_PATH); c.innerHTML = ''; s.innerHTML = '<option value="">-- Seleccionar Plantilla --</option>'; templates = data||[]; templates.forEach(f => { c.innerHTML += `<div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-100"><span class="text-xs font-bold text-gray-700 truncate">${f.name}</span><button onclick="window.deleteTemplate('${f.name}')" class="text-red-400 hover:text-red-600 px-2"><i class="fa-solid fa-trash"></i></button></div>`; const opt = document.createElement('option'); opt.value = f.name; opt.innerText = f.name.replace(/\.[^/.]+$/, ""); s.appendChild(opt); }); };
window.uploadTemplate = async function() { const n = document.getElementById('new-template-name'); const f = document.getElementById('new-template-file').files[0]; if (!f || !n.value) return window.showToast("Faltan datos", "error"); const p = `${TEMPLATE_PATH}/${n.value}.${f.name.split('.').pop()}`; await window.globalSupabase.storage.from(TEMPLATE_BUCKET).upload(p, f); window.showToast("Guardada"); n.value=''; window.loadTemplatesList(); }
window.loadSelectedTemplate = async function() {
    const fileName = document.getElementById('template-selector').value;
    if(!fileName || !selectedOrder) return;

    try {
        const { data, error } = await window.globalSupabase
            .storage.from(TEMPLATE_BUCKET)
            .download(`${TEMPLATE_PATH}/${fileName}`);

        if(error) throw error;
        let text = await data.text();

        const hl = (val) => `<span class="var-highlight">${val || '---'}</span>`;
        text = text
            .replace(/{{CLIENTE}}/g, hl(selectedOrder.cliente_nombre))
            .replace(/{{RFC}}/g, hl(selectedOrder.cliente_rfc || '---'))
            .replace(/{{TELEFONO}}/g, hl(selectedOrder.cliente_contacto))
            .replace(/{{EMAIL}}/g, hl(selectedOrder.cliente_email))
            .replace(/{{ESPACIO}}/g, hl(selectedOrder.espacio_nombre))
            .replace(/{{CLAVE}}/g, hl(selectedOrder.espacio_clave))
            .replace(/{{FECHA_INICIO}}/g, hl(window.formatDate(selectedOrder.fecha_inicio)))
            .replace(/{{FECHA_FIN}}/g, hl(window.formatDate(selectedOrder.fecha_fin)))
            .replace(/{{MONTO_TOTAL}}/g, hl(window.formatMoney(selectedOrder.precio_final)))
            .replace(/{{FECHA_HOY}}/g, hl(new Date().toLocaleDateString('es-MX')))
            .replace(/{{NUM_ORDEN}}/g, hl(selectedOrder.numero_orden))
            .replace(/{{NUM_CONTRATO}}/g, hl(selectedOrder.numero_contrato || 'PENDIENTE'));

        setContractPreviewSrcdoc(text);
        setTimeout(window.adjustPreviewScale, 50);
    } catch (e) {
        console.error(e);
        window.showToast("Error al cargar plantilla", "error");
        setContractPreviewSrcdoc(null);
    }
};
// --- MODIFICADO: IMPRESIÓN (SIN RESTRICCIÓN) ---
// --- IMPRESIÓN (CON PLANTILLA AISLADA EN IFRAME) ---
window.printContract = function() {
    if(!selectedOrder) return;

    const iframe = document.getElementById('contract-preview-iframe');
    const doc = iframe && iframe.contentDocument;
    if(!doc) {
        window.showToast("No hay contrato cargado.", "error");
        return;
    }

    // Clonamos el HTML del iframe y desactivamos el resaltado para impresión
    let html = doc.documentElement.outerHTML;
    html = html.replace(/<\/head>/i, `<style>.var-highlight{font-weight:bold;background:transparent;padding:0;border-radius:0;}</style></head>`);

    const win = window.open('', '', 'height=800,width=1000');
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();

    // Activamos el botón para que puedan finalizar después de imprimir si lo desean
    const btnFinalize = document.getElementById('btn-open-finalize');
    btnFinalize.disabled = false;
    btnFinalize.classList.remove('bg-gray-300', 'cursor-not-allowed');
    btnFinalize.classList.add('bg-green-600', 'hover:bg-green-700', 'shadow-lg');
};

window.deleteTemplate = async function(fileName) { window.openCustomConfirm("¿Eliminar esta plantilla?", async () => { const { error } = await window.globalSupabase.storage.from(TEMPLATE_BUCKET).remove([`${TEMPLATE_PATH}/${fileName}`]); if(!error) { window.showToast("Eliminada"); window.loadTemplatesList(); } else window.showToast("Error al eliminar", "error"); }); }
window.openFinalizeModal = function() { pendingAction = 'finalize'; if(!validateRequiredData()) return; const contractNum = document.getElementById('contract-num-assign').value; if(!contractNum) return window.showToast("Asigna un Número de Contrato.", "error"); window.openModal('finalize-modal'); }

window.confirmFinalize = async function() { 
    if(!selectedOrder || !signedFileToUpload) return; 
    const btn = document.getElementById('btn-confirm-finalize'); 
    const contractNum = document.getElementById('contract-num-assign').value; 
    btn.innerText = "Procesando..."; 
    btn.disabled = true; 
    try { 
        const path = `${selectedOrder.id}/${Date.now()}_contrato_firmado.pdf`; 
        const { error: upErr } = await window.globalSupabase.storage.from('documentos').upload(path, signedFileToUpload); 
        if(upErr) throw upErr; 
        
        // MODIFICADO: Se elimina 'status: finalizada'. 
        // La orden permanece en el estado actual (aprobada) hasta que se suba la factura.
        const { error: dbErr } = await window.finSupabase.from('cotizaciones').update({ contrato_url: path, numero_contrato: contractNum }).eq('id', selectedOrder.id); 
        
        if(dbErr) throw dbErr; 
        window.showToast("Contrato Guardado Correctamente", "success"); 
        window.closeModal('finalize-modal'); 
        loadApprovedOrders(); 
        
        // Restaurar la vista inicial
        document.getElementById('workspace-empty').classList.remove('hidden');
        document.getElementById('wk-header').classList.add('hidden'); 
        document.getElementById('wk-header').classList.remove('flex');
        document.getElementById('wk-tabs').classList.add('hidden');
        document.getElementById('wk-content').classList.add('hidden');
        document.getElementById('sidebar-empty').classList.remove('hidden');
        
        document.getElementById('sidebar-receipt').classList.add('hidden');
        document.getElementById('sidebar-receipt').classList.remove('flex');
        document.getElementById('sidebar-contract').classList.add('hidden');
        document.getElementById('sidebar-contract').classList.remove('flex');

    } catch(e) { 
        window.showToast("Error: "+e.message, "error"); 
    } finally { 
        btn.innerText = "Confirmar"; 
        btn.disabled = false; 
    } 
}

// --- NUEVA LÓGICA: RECIBOS EXTERNOS ---
window.openUploadReceiptModal = function() {
    if(!selectedOrder) return;
    
    // Limpiar campos
    document.getElementById('ext-receipt-file').value = '';
    document.getElementById('lbl-ext-receipt').innerText = 'Seleccionar Archivo (PDF o Imagen)';
    document.getElementById('ext-preview-container').classList.add('hidden');
    document.getElementById('ext-pdf-preview').classList.add('hidden');
    document.getElementById('ext-img-preview').classList.add('hidden');
    
    // Precargar datos
    const history = selectedOrder.historial_pagos || [];
    const nextPaymentNum = history.length + 1;
    document.getElementById('up-rcp-concept').value = `Pago ${nextPaymentNum} / ${selectedOrder.espacio_nombre}`;
    document.getElementById('up-rcp-amount').value = currentRemainingBalance > 0 ? currentRemainingBalance.toFixed(2) : '';
    document.getElementById('up-rcp-bank').value = "Externo";
    document.getElementById('up-rcp-account').value = "---";
    document.getElementById('up-rcp-ref').value = selectedOrder.numero_orden || `ORD-${selectedOrder.id.slice(0,6).toUpperCase()}`;
    
    document.getElementById('btn-save-ext-receipt').disabled = true;
    document.getElementById('btn-save-ext-receipt').classList.add('bg-gray-300', 'cursor-not-allowed');
    document.getElementById('btn-save-ext-receipt').classList.remove('bg-brand-red');

    externalReceiptFile = null;
    window.openModal('upload-receipt-modal');
}

window.handleReceiptFileSelect = function(input) {
    if(input.files[0]) {
        externalReceiptFile = input.files[0];
        document.getElementById('lbl-ext-receipt').innerText = input.files[0].name;
        
        // Preview
        const previewContainer = document.getElementById('ext-preview-container');
        const pdfFrame = document.getElementById('ext-pdf-preview');
        const imgFrame = document.getElementById('ext-img-preview');
        
        previewContainer.classList.remove('hidden');
        const url = URL.createObjectURL(externalReceiptFile);
        
        if(externalReceiptFile.type.includes('pdf')) {
            pdfFrame.src = url;
            pdfFrame.classList.remove('hidden');
            imgFrame.classList.add('hidden');
        } else {
            imgFrame.src = url;
            imgFrame.classList.remove('hidden');
            pdfFrame.classList.add('hidden');
        }

        // Habilitar Guardar
        const btn = document.getElementById('btn-save-ext-receipt');
        btn.disabled = false;
        btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
        btn.classList.add('bg-brand-red', 'hover:bg-red-700');
    }
}

window.saveExternalReceipt = async function() {
    if(!selectedOrder || !externalReceiptFile) return;
    
    const amount = parseFloat(document.getElementById('up-rcp-amount').value);
    if(isNaN(amount) || amount <= 0) return window.showToast("Monto inválido", "error");
    
    const btn = document.getElementById('btn-save-ext-receipt');
    btn.disabled = true; btn.innerText = "Subiendo...";
    
    try {
        const fileExt = externalReceiptFile.name.split('.').pop();
        const fileName = `Comprobante_Externo_${Date.now()}.${fileExt}`;
        const filePath = `${selectedOrder.id}/recibos/${fileName}`;
        
        const { error: upErr } = await window.globalSupabase.storage.from('documentos').upload(filePath, externalReceiptFile);
        if(upErr) throw upErr;
        
        const newPayment = { 
            date: new Date().toISOString(), 
            amount: amount, 
            concept: document.getElementById('up-rcp-concept').value, 
            reference: document.getElementById('up-rcp-ref').value, 
            bank: document.getElementById('up-rcp-bank').value, 
            account: document.getElementById('up-rcp-account').value, 
            file_path: filePath 
        };
        
        const updatedHistory = [...(selectedOrder.historial_pagos || []), newPayment];
        const { error: dbErr } = await window.finSupabase.from('cotizaciones').update({ historial_pagos: updatedHistory }).eq('id', selectedOrder.id);
        if(dbErr) throw dbErr;
        
        window.showToast("Comprobante Guardado", "success");
        window.closeModal('upload-receipt-modal');
        
        loadApprovedOrders(); 
        selectedOrder.historial_pagos = updatedHistory; 
        selectOrder(selectedOrder);
        
    } catch(e) {
        console.error(e);
        window.showToast("Error: " + e.message, "error");
    } finally {
        btn.innerText = "Guardar";
        btn.disabled = false;
    }
}

function renderVariablesCheatSheet() { const container = document.getElementById('variables-list'); container.innerHTML = ''; AVAILABLE_VARS.forEach(v => { const badge = document.createElement('span'); badge.className = 'var-tag'; badge.innerText = v.key; badge.title = v.desc; badge.onclick = () => { navigator.clipboard.writeText(v.key); window.showToast("Copiado"); }; container.appendChild(badge); }); }

// --- GENERADOR PDF UNIFICADO (DISEÑO PREMIUM) ---
function getReceiptHTML(isVisual = false) {
    if(!selectedOrder) return '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isLiquidated = currentRemainingBalance <= 0.01;
    
    if (isLiquidated) {
        const payments = selectedOrder.historial_pagos || [];
        let rowsHtml = '';
        payments.forEach(p => {
            rowsHtml += `
                <tr class="border-b border-gray-100 last:border-0">
                    <td class="py-3 text-gray-600">${window.formatDate(p.date)}</td>
                    <td class="py-3 text-gray-600 font-bold">${p.bank || '---'} / ${p.account || '---'}</td>
                    <td class="py-3 text-gray-600">${p.reference}</td>
                    <td class="py-3 text-right font-mono font-bold text-gray-800">${window.formatMoney(p.amount)}</td>
                </tr>
            `;
        });
        let watermark = `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 110px; color: rgba(34, 197, 94, 0.12); font-weight: 900; border: 12px solid rgba(34, 197, 94, 0.12); padding: 40px; z-index: 0; pointer-events: none; white-space: nowrap;">LIQUIDADO</div>`;
        return `
            <div id="receipt-print-area" class="bg-white font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: 816px; min-height: 1056px; padding: 70px 90px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;">
                ${watermark}
                <div style="position: relative; z-index: 10; flex-grow: 1;">
                    <div class="flex justify-between items-start mb-10 border-b-4 border-green-600 pb-4">
                        <img src="${LOGO_URL}" class="h-16 object-contain" crossorigin="anonymous">
                        <div class="text-right"><h1 class="text-2xl font-black uppercase text-gray-900 tracking-tighter">Constancia de Liquidación</h1><p class="text-sm text-gray-500 font-mono mt-1">EMISIÓN: ${dateStr} ${timeStr}</p></div>
                    </div>
                    <div class="mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente:</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Espacio:</span><span class="text-base font-bold text-gray-900">${selectedOrder.espacio_nombre}</span></div>
                        <div class="flex justify-between"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Contrato:</span><span class="text-xl font-black text-brand-red">${window.formatMoney(selectedOrder.precio_final)}</span></div>
                    </div>
                    <div class="mb-10"><h3 class="font-bold text-xs uppercase text-gray-400 mb-4 tracking-widest pl-2">Resumen de Pagos Realizados</h3><div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"><table class="w-full text-xs text-left"><thead><tr class="text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100"><th class="pb-3">Fecha</th><th class="pb-3">Banco / Cuenta</th><th class="pb-3">Referencia</th><th class="text-right pb-3">Monto</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>
                    <div class="mb-12 flex justify-end"><div class="bg-green-50 px-8 py-5 rounded-xl border border-green-100 text-right shadow-sm"><p class="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Saldo Pendiente</p><p class="text-3xl font-black text-green-700">$0.00</p></div></div>
                </div>
                <div style="margin-top: auto; position: relative; z-index: 10;">
                    <div class="flex justify-between gap-16 mb-8"><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-2"></div><p class="text-xs font-bold text-gray-900 uppercase">Cobranza</p></div><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-2"></div><p class="text-xs font-bold text-gray-900 uppercase">Administración</p></div></div>
                    <div class="text-[10px] text-center text-gray-400 mt-4"><p class="mb-1">Este documento certifica que la orden de referencia ha sido liquidada en su totalidad.</p><p>Generado digitalmente a través de Marketing Hub.</p></div>
                </div>
            </div>`;
    }
    
    const amount = parseFloat(document.getElementById('rcp-amount').value) || 0;
    const concept = document.getElementById('rcp-concept').value;
    const bank = document.getElementById('rcp-bank').value;
    const account = document.getElementById('rcp-account').value;
    const ref = document.getElementById('rcp-ref').value;
    let projectedRemaining = currentRemainingBalance - amount; if (projectedRemaining < 0) projectedRemaining = 0;

    return `
        <div id="receipt-print-area" class="bg-white font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: 816px; min-height: 1056px; padding: 70px 90px; box-sizing: border-box; display: flex; flex-direction: column;">
            <div style="flex-grow: 1;">
                <div class="flex justify-between items-start mb-10 border-b-4 border-brand-red pb-4">
                    <img src="${LOGO_URL}" class="h-16 object-contain" crossorigin="anonymous">
                    <div class="text-right"><h1 class="text-3xl font-black uppercase text-gray-900 tracking-tighter">Recibo de Pago</h1><p class="text-sm text-gray-500 font-mono mt-1">FECHA: ${dateStr}</p><p class="text-xs text-gray-400 font-mono">HORA: ${timeStr}</p></div>
                </div>
                <div class="mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
                    <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Recibimos de:</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                    <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">La cantidad de:</span><span class="text-2xl font-black text-brand-red">${window.formatMoney(amount)}</span></div>
                    <div class="flex justify-between mb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Concepto:</span><span class="text-sm font-medium text-gray-700 text-right max-w-[60%]">${concept}</span></div>
                    <div class="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-lg mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Referencia Interna:</span><div class="text-right"><span class="block text-sm font-bold text-gray-800 font-mono">${selectedOrder.numero_orden || '---'}</span><span class="block text-[10px] text-gray-400 font-mono tracking-widest">${selectedOrder.id.slice(0,8).toUpperCase()}</span></div></div>
                </div>
                <div class="grid grid-cols-2 gap-12 text-xs text-gray-600 mb-8">
                    <div><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">Datos Bancarios</p><p class="mb-1">Banco: <strong class="text-gray-900 uppercase">${bank}</strong></p><p>Cuenta/CLABE: <strong class="text-gray-900 uppercase">${account}</strong></p></div>
                    <div class="text-right"><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">Referencia</p><p class="font-mono text-base text-gray-900">${ref}</p></div>
                </div>
                <div class="mb-12 flex justify-end"><div class="bg-red-50 px-8 py-4 rounded-xl border border-red-100 text-right shadow-sm"><p class="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Saldo Pendiente por Liquidar</p><p class="text-2xl font-black text-red-600">${window.formatMoney(projectedRemaining)}</p></div></div>
            </div>
            <div style="margin-top: auto;">
                <div class="flex justify-between gap-16 mb-8"><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-1"></div><p class="text-xs font-bold text-gray-900 uppercase">Cobranza / Finanzas</p><p class="text-[10px] text-gray-400 uppercase">Plaza Mayor</p></div><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-1"></div><p class="text-xs font-bold text-gray-900 uppercase">Mercadotecnia</p><p class="text-[10px] text-gray-400 uppercase">Plaza Mayor</p></div></div>
                <div class="text-[10px] text-center text-gray-400 mt-4"><p class="mb-1">Este documento es un comprobante de pago interno. No válido como factura fiscal.</p><p>Generado digitalmente a través de Marketing Hub.</p></div>
            </div>
        </div>`;
}
