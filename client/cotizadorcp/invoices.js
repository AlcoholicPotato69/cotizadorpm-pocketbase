/**
 * DOC: client\cotizadorcp\invoices.js
 * Proposito: Gestion de facturas y seguimiento administrativo.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE FACTURACIÓN (VALIDACIÓN XML + STORAGE)
// =========================================================================

/* -------------------------------------------------------------------------
 * 0. CONEXIÓN A BASE DE DATOS (ÚNICO LUGAR A CAMBIAR)
 * ------------------------------------------------------------------------- */
const SB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseUrl) || 'http://127.0.0.1:54321';
const SB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseAnonKey) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// (Opcional) Esquema finanzas configurable
const __p = window.location.pathname || '';
const __isCP = /\/cotizadorcp(\/|$)/.test(__p) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __isCP ? 'finanzas_casadepiedra' : ((window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas');
let approvedOrders = [], selectedOrder = null;
let files = { xml: null, pdf: null };
let xmlData = null; // Datos extraídos del XML
let confirmCallback = null;

// --- HELPERS GLOBALES ---
window.openModal = (id) => { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); }
window.closeModal = (id) => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); }
window.showToast = (msg, type='success') => {
    const c = document.getElementById('toast-container');
    const e = document.createElement('div');
    e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type==='error'?'bg-red-500':'bg-green-500'}`;
    e.innerText = msg; c.appendChild(e); setTimeout(() => e.remove(), 3000);
}
window.openConfirm = (msg, cb) => {
    document.getElementById('confirm-title').innerText = msg;
    confirmCallback = cb;
    window.openModal('generic-confirm-modal');
}
function formatMoney(v){ return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); }

// --- INICIO ---
document.addEventListener('DOMContentLoaded', async () => {
    if (window.PB_CLIENT) {
        if(!window.finSupabase) window.finSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY, { db: { schema: FIN_SCHEMA } });
        if(!window.globalSupabase) window.globalSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY);
    }
    const { data: { session } } = await window.globalSupabase.auth.getSession();
    if (!session) window.location.href = 'index.html';

    loadOrders();

    document.getElementById('search-orders').addEventListener('input', (e) => filterOrders(e.target.value));
    document.getElementById('btn-confirm-action').addEventListener('click', () => {
        if(confirmCallback) confirmCallback();
        window.closeModal('generic-confirm-modal');
    });
});

// --- CARGA DE ÓRDENES ---
async function loadOrders() {
    const listContainer = document.getElementById('orders-list');
    listContainer.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">Cargando...</div>';

    // Traemos también columnas nuevas de factura
    const { data, error } = await window.finSupabase
        .from('cotizaciones')
        .select('*')
        .in('status', ['aprobada', 'finalizada'])
        .order('created_at', { ascending: false });

    if(error) {
        listContainer.innerHTML = '<div class="text-red-400 text-center text-xs">Error al cargar.</div>';
        return;
    }

    approvedOrders = data || [];
    filterOrders('');
}

function filterOrders(term) {
    const container = document.getElementById('orders-list');
    container.innerHTML = '';
    
    const filtered = approvedOrders.filter(o => o.cliente_nombre.toLowerCase().includes(term.toLowerCase()) || (o.numero_orden && o.numero_orden.toLowerCase().includes(term.toLowerCase())));
    
    if (filtered.length === 0) { container.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">Sin resultados.</div>'; return; }

    filtered.forEach(o => {
        const hasInvoice = !!o.factura_xml_url; // Si tiene URL, ya tiene factura
        const icon = hasInvoice 
            ? '<i class="fa-solid fa-check-circle text-green-500 text-lg"></i>' 
            : '<i class="fa-regular fa-circle text-gray-300 text-lg"></i>';
        
        const item = document.createElement('div');
        item.className = 'bg-white border border-gray-100 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition group shadow-sm mb-2';
        item.onclick = () => selectOrder(o);
        item.innerHTML = `
            <div class="flex justify-between mb-1">
                <span class="font-bold text-xs text-gray-800 truncate w-32">${o.cliente_nombre}</span>
                <span class="text-[9px] font-mono text-gray-500 bg-gray-50 px-1 rounded border">${o.numero_orden || '---'}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-[10px] text-gray-400">${hasInvoice ? 'Facturada' : 'Pendiente'}</span>
                ${icon}
            </div>
        `;
        container.appendChild(item);
    });
}

// --- SELECCIÓN Y LÓGICA DE VISTA ---
function selectOrder(order) {
    selectedOrder = order;
    files = { xml: null, pdf: null }; xmlData = null;
    
    document.getElementById('workspace-empty').classList.add('hidden');
    document.getElementById('workspace-active').classList.remove('hidden');
    document.getElementById('workspace-active').classList.add('flex');
    
    document.getElementById('wk-client').innerText = order.cliente_nombre;
    document.getElementById('wk-folio').innerText = order.numero_orden || 'PENDIENTE';
    document.getElementById('wk-total').innerText = formatMoney(order.precio_final);
    document.getElementById('target-amount').innerText = formatMoney(order.precio_final);

    if (order.factura_xml_url) {
        // MODO VER (Ya tiene factura)
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('view-section').classList.remove('hidden');
        document.getElementById('view-section').classList.add('flex');
        
        // Mostrar datos guardados
        const meta = order.datos_factura || {}; // JSONB
        document.getElementById('view-uuid').innerText = `UUID: ${meta.uuid || '---'}`;
        
        loadPdfPreview(order.factura_pdf_url);
    } else {
        // MODO SUBIR
        document.getElementById('view-section').classList.add('hidden');
        document.getElementById('view-section').classList.remove('flex');
        document.getElementById('upload-section').classList.remove('hidden');
        resetUploadForm();
    }
}

function resetUploadForm() {
    document.getElementById('file-xml').value = '';
    document.getElementById('file-pdf').value = '';
    document.getElementById('lbl-xml').innerText = 'No seleccionado';
    document.getElementById('lbl-pdf').innerText = 'No seleccionado';
    document.getElementById('check-xml').classList.add('hidden');
    document.getElementById('check-pdf').classList.add('hidden');
    
    const btn = document.getElementById('btn-save-invoice');
    btn.disabled = true;
    btn.classList.add('bg-gray-300', 'cursor-not-allowed');
    btn.classList.remove('bg-brand-red', 'hover:bg-red-700', 'shadow-lg');
}

// --- MANEJO DE ARCHIVOS Y VALIDACIÓN XML ---
window.handleFileSelect = function(input, type) {
    if (input.files[0]) {
        files[type] = input.files[0];
        document.getElementById(`lbl-${type}`).innerText = files[type].name;
        document.getElementById(`check-${type}`).classList.remove('hidden');
        
        if (type === 'xml') parseXML(files.xml); // Validar contenido XML al seleccionar
        checkReady();
    }
}

function parseXML(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
            
            // Namespaces pueden variar (cfdi: o sin prefijo), buscamos tags por nombre local
            const comprobante = xmlDoc.getElementsByTagNameNS("*", "Comprobante")[0];
            const timbre = xmlDoc.getElementsByTagNameNS("*", "TimbreFiscalDigital")[0];
            const receptor = xmlDoc.getElementsByTagNameNS("*", "Receptor")[0];

            if (!comprobante || !timbre || !receptor) throw new Error("XML incompleto o formato no válido.");

            const total = parseFloat(comprobante.getAttribute("Total"));
            const uuid = timbre.getAttribute("UUID");
            const rfc = receptor.getAttribute("Rfc");
            const nombre = receptor.getAttribute("Nombre");

            // VALIDACIÓN DE MONTO (Tolerancia $1.00 por redondeo)
            const expected = parseFloat(selectedOrder.precio_final);
            if (Math.abs(total - expected) > 1.00) {
                window.showToast(`Error: Total XML (${formatMoney(total)}) no coincide con Orden (${formatMoney(expected)})`, "error");
                xmlData = null; // Invalidar
                document.getElementById('check-xml').classList.add('hidden');
                document.getElementById('check-xml').classList.remove('text-green-500'); // Visual error indicator could be added here
            } else {
                xmlData = { total, uuid, rfc, nombre };
                window.showToast("XML Validado Correctamente", "success");
            }
            checkReady();

        } catch (err) {
            console.error(err);
            window.showToast("Error al leer XML: " + err.message, "error");
            xmlData = null;
        }
    };
    reader.readAsText(file);
}

function checkReady() {
    const btn = document.getElementById('btn-save-invoice');
    // Solo activar si hay PDF, XML y el XML fue validado exitosamente (xmlData != null)
    if (files.xml && files.pdf && xmlData) {
        btn.disabled = false;
        btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
        btn.classList.add('bg-brand-red', 'hover:bg-red-700', 'shadow-lg');
    } else {
        btn.disabled = true;
        btn.classList.add('bg-gray-300', 'cursor-not-allowed');
        btn.classList.remove('bg-brand-red', 'hover:bg-red-700', 'shadow-lg');
    }
}

// =========================================================
// CAMBIO LÓGICO: AQUI SE FINALIZA LA ORDEN
// SI EXISTE CONTRATO, SE CAMBIA STATUS A 'FINALIZADA'
// =========================================================
window.validateAndSaveInvoice = async function() {
    if (!xmlData || !files.pdf) return;
    
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const timestamp = Date.now();
        const xmlPath = `${selectedOrder.id}/facturas/${timestamp}_factura.xml`;
        const pdfPath = `${selectedOrder.id}/facturas/${timestamp}_factura.pdf`;

        // 1. Subir Archivos
        const { error: err1 } = await window.globalSupabase.storage.from('documentos-cp').upload(xmlPath, files.xml);
        if (err1) throw err1;
        const { error: err2 } = await window.globalSupabase.storage.from('documentos-cp').upload(pdfPath, files.pdf);
        if (err2) throw err2;

        // 2. Preparar Datos para BD
        const currentFiscal = selectedOrder.datos_fiscales || {};
        
        // Determinar si finalizamos la orden:
        // Si ya tiene contrato (URL o Número) Y estamos subiendo factura valida -> FINALIZAR
        let nextStatus = selectedOrder.status;
        if (selectedOrder.contrato_url || selectedOrder.numero_contrato) {
            nextStatus = 'finalizada';
        }

        const updatePayload = {
            factura_xml_url: xmlPath,
            factura_pdf_url: pdfPath,
            datos_factura: xmlData, 
            datos_fiscales: { 
                ...currentFiscal, 
                rfc_receptor: xmlData.rfc,
                razon_social: xmlData.nombre,
                uuid_factura: xmlData.uuid
            },
            status: nextStatus // Actualizamos el estado aquí
        };

        const { error: dbErr } = await window.finSupabase
            .from('cotizaciones')
            .update(updatePayload)
            .eq('id', selectedOrder.id);

        if (dbErr) throw dbErr;

        if (nextStatus === 'finalizada') {
            window.showToast("¡Orden Finalizada Correctamente!", "success");
        } else {
            window.showToast("Factura guardada. Falta contrato para finalizar.", "warning");
        }
        
        // Recargar
        loadOrders();
        selectedOrder = { ...selectedOrder, ...updatePayload };
        selectOrder(selectedOrder);

    } catch (e) {
        console.error(e);
        window.showToast("Error al guardar: " + e.message, "error");
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

// --- VISUALIZAR Y DESCARGAR ---
async function loadPdfPreview(path) {
    const frame = document.getElementById('pdf-viewer');
    const msg = document.getElementById('no-pdf-msg');
    
    const { data, error } = await window.globalSupabase.storage
        .from('documentos-cp')
        .createSignedUrl(path, 3600); // URL válida 1 hora
    
    if (error || !data) {
        frame.classList.add('hidden');
        msg.classList.remove('hidden');
    } else {
        frame.src = data.signedUrl;
        frame.classList.remove('hidden');
        msg.classList.add('hidden');
    }
}

window.downloadFile = async function(type) {
    const path = type === 'xml' ? selectedOrder.factura_xml_url : selectedOrder.factura_pdf_url;
    if (!path) return window.showToast("Archivo no encontrado", "error");

    const { data } = await window.globalSupabase.storage.from('documentos-cp').createSignedUrl(path, 60);
    if (data) window.open(data.signedUrl, '_blank');
    else window.showToast("Error al descargar", "error");
}

window.deleteInvoice = function() {
    window.openConfirm("¿Eliminar factura? Esto desbloqueará la edición.", async () => {
        document.getElementById('loading-overlay').classList.remove('hidden');
        try {
            // Borrar archivos del bucket
            await window.globalSupabase.storage.from('documentos-cp')
                .remove([selectedOrder.factura_xml_url, selectedOrder.factura_pdf_url]);

            // Limpiar BD
            // Al borrar factura, si estaba finalizada, regresa a aprobada? 
            // Usualmente si falta documento, ya no está finalizada. Regresamos a status original si es necesario, 
            // pero por seguridad mantenemos 'aprobada' para que vuelva a validarse.
            const { error } = await window.finSupabase.from('cotizaciones').update({
                factura_xml_url: null,
                factura_pdf_url: null,
                datos_factura: null,
                status: 'aprobada' // Regresamos a aprobada si borramos la factura
            }).eq('id', selectedOrder.id);

            if (error) throw error;
            
            window.showToast("Factura eliminada");
            loadOrders();
            // Resetear local
            selectedOrder.factura_xml_url = null;
            selectedOrder.factura_pdf_url = null;
            selectedOrder.status = 'aprobada';
            selectOrder(selectedOrder);

        } catch (e) {
            window.showToast("Error al eliminar", "error");
        } finally {
            document.getElementById('loading-overlay').classList.add('hidden');
        }
    });
}

