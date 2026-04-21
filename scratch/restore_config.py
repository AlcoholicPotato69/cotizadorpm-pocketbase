import os

path = r'c:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase\frontend\client\system\config.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Start after Confirmar Clave label
start_token = '<label class="block text-[10px] font-black uppercase tracking-wider text-gray-500" id="lbl-passwordConfirm">Confirmar Clave <span id="pwdc-req" class="text-red-500">*</span></label>'

# End before getPdfEditorActiveStyle
end_token = '    function getPdfEditorActiveStyle() {'

start_idx = content.find(start_token)
end_idx = content.find(end_token)

if start_idx == -1 or end_idx == -1:
    print(f"Error: Tokens not found. Start: {start_idx}, End: {end_idx}")
    exit(1)

line_end = content.find('\n', start_idx) + 1

# This segment restores the entire missing block including multi-tenant form fields, script tag, and variables.
new_segment = r"""              <input type="password" id="user-passwordConfirm" placeholder="Mínimo 8 caracteres" class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition" />
            </div>
          </div>
          <p class="text-[10px] text-gray-400 font-bold hidden" id="user-pwd-hint">Para cambiar la contraseña, llena los campos arriba. Déjalos en blanco para conservarla.</p>
          <hr class="border-gray-100 my-2">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase text-brand-red tracking-wider">Rol de Sistema <span class="text-red-500">*</span></label>
              <select id="user-role" required class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition text-gray-700 cursor-pointer">
                <option value="admin">Administrador Global</option>
                <option value="plaza_mayor">Agente Plaza Mayor</option>
                <option value="casa_de_piedra">Agente Casa Piedra</option>
                <option value="user">Usuario Básico</option>
                <option value="verificador">Verificador</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase text-brand-red tracking-wider">Sede Principal <span class="text-red-500">*</span></label>
              <select id="user-default-tenant" required class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition text-gray-700 cursor-pointer">
                <option value="plaza_mayor">Plaza Mayor</option>
                <option value="casa_de_piedra">Casa de Piedra</option>
              </select>
            </div>
          </div>
          <div class="space-y-2 mt-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
             <label class="block text-[10px] font-black uppercase text-gray-500 tracking-wider">Sedes Permitidas (Accesos Multi-Tenant)</label>
             <div class="flex flex-col sm:flex-row gap-4 mt-1">
                 <label class="flex items-center gap-2 cursor-pointer w-max">
                     <input type="checkbox" id="user-allowed-pm" value="plaza_mayor" class="accent-brand-red w-4 h-4 rounded cursor-pointer" />
                     <span class="text-xs font-bold text-gray-700">Plaza Mayor</span>
                 </label>
                 <label class="flex items-center gap-2 cursor-pointer w-max">
                     <input type="checkbox" id="user-allowed-cp" value="casa_de_piedra" class="accent-brand-red w-4 h-4 rounded cursor-pointer" />
                     <span class="text-xs font-bold text-gray-700">Casa de Piedra</span>
                 </label>
             </div>
          </div>
        </form>
      </div>
      <div class="bg-gray-50 border-t border-gray-100 p-4 flex justify-end gap-3 rounded-b-3xl shrink-0">
        <button type="button" onclick="window.closeUserModal()" class="px-5 py-2 rounded-xl text-xs font-black text-gray-500 hover:bg-gray-200 transition tracking-wider uppercase">Cancelar</button>
        <button type="submit" form="form-user" id="btn-save-user" class="bg-brand-red text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-red-700 transition tracking-wider uppercase shadow flex items-center gap-2">
          <i class="fa-solid fa-save"></i> Guardar
        </button>
      </div>
    </div>
  </div>

  <script>
    let pmPocketBase = null;
    let cpPocketBase = null;
    let activePocketBase = null;

    let isAdminUser = false;
    let currentView = 'v_concepts';
    let currentTenant = 'pm'; // pm | cp

    const PM_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) ? window.HUB_CONFIG.finanzasSchema : 'finanzas';
    const CP_SCHEMA = 'finanzas_casadepiedra';
    const DOC_TEMPLATE_PATH = 'templates_contratos';
    const DOC_LETTERHEAD_PATH = 'membretes_pdf';
    const CFG_TEMPLATE_DEFAULT_KEY = 'contract_template_default';
    const CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';

    const PDF_EDITOR_OVERLAYS_COLLECTION = 'pdf_overlays';
    const PDF_EDITOR_OVERLAY_DOC_TYPE_BY_ID = Object.freeze({
      quote: 'generator:quotes',
      order: 'generator:orders',
      receipt: 'generator:receipts',
      contract: 'generator:contracts',
      dictamen: 'generator:dictamenes'
    });
    let docsDefaultTemplateFile = '';
    let docsDefaultLetterheadFile = '';

    let pdfEditorConfigRecordId = '';
    let pdfEditorSelectedType = 'quote';
    let pdfEditorSelectedItemId = '';
    let pdfEditorSelectedTemplateId = '';
    let pdfEditorProfiles = {};
    let pdfEditorTemplates = {};
    let pdfEditorSyncTimer = null;
    let pdfEditorDragState = null;
    let pdfEditorLetterheadUrl = '';
    let pdfEditorPreviewScale = 1;
    let pdfEditorResizeBound = false;

    const PDF_EDITOR_DOC_TYPES = Object.freeze([
      { id: 'quote', title: 'Cotización', icon: 'fa-file-invoice-dollar', note: 'Cotizador' },
      { id: 'order', title: 'Orden de compra', icon: 'fa-file-contract', note: 'Cotizador' },
      { id: 'receipt', title: 'Recibos / Constancias', icon: 'fa-receipt', note: 'Contratos' },
      { id: 'contract', title: 'Contrato', icon: 'fa-file-signature', note: 'Plantilla' },
      { id: 'dictamen', title: 'Dictamen', icon: 'fa-user-shield', note: 'Expediente' }
    ]);
    const PDF_EDITOR_FONT_MAP = Object.freeze({
      segoe: '"Segoe UI", Arial, sans-serif',
      arial: 'Arial, Helvetica, sans-serif',
      verdana: 'Verdana, Geneva, sans-serif',
      georgia: 'Georgia, "Times New Roman", serif',
      times: '"Times New Roman", Times, serif',
      trebuchet: '"Trebuchet MS", Arial, sans-serif'
    });
    const PDF_EDITOR_FONT_LABELS = Object.freeze({
      segoe: 'Segoe UI',
      arial: 'Arial',
      verdana: 'Verdana',
      georgia: 'Georgia',
      times: 'Times New Roman',
      trebuchet: 'Trebuchet MS'
    });
    const PDF_EDITOR_DEFAULTS = Object.freeze({
      fontFamilyKey: 'segoe',
      headerLinePx: 4,
      titlePx: 30,
      metaPx: 13,
      tableHeadPx: 14,
      tableBodyPx: 12,
      lineHeightPct: 120,
      quickPx: 12,
      conditionsPx: 14,
      signPx: 12,
      footerPx: 10,
      offsetXPx: 0,
      offsetYPx: 0,
      extraPages: 0,
      resources: [],
      headerAlign: 'right',
      metaAlign: 'right',
      tableAlign: 'left',
      quickAlign: 'left',
      conditionsAlign: 'justify',
      signAlign: 'center',
      summaryAlign: 'left',
      footerAlign: 'center'
    });
    const PDF_EDITOR_BASE_SIZE_LIMITS = Object.freeze({
      titlePx: { min: 20, max: 42 },
      metaPx: { min: 8, max: 18 },
      tableBodyPx: { min: 9, max: 16 },
      quickPx: { min: 9, max: 16 },
      conditionsPx: { min: 9, max: 18 },
      signPx: { min: 9, max: 16 },
      footerPx: { min: 8, max: 14 }
    });
    const PDF_EDITOR_BASE_BLOCKS = Object.freeze([
      { id: 'base:header-title', key: 'header-title', label: 'Título Encabezado', sizeField: 'titlePx', alignField: 'headerAlign' },
      { id: 'base:header-meta', key: 'header-meta', label: 'Meta Encabezado', sizeField: 'metaPx', alignField: 'metaAlign' },
      { id: 'base:table-body', key: 'table-body', label: 'Tabla Conceptos', sizeField: 'tableBodyPx', alignField: 'tableAlign' },
      { id: 'base:summary', key: 'summary', label: 'Resumen Totales', alignField: 'summaryAlign' },
      { id: 'base:quick', key: 'quick', label: 'Notas', sizeField: 'quickPx', alignField: 'quickAlign' },
      { id: 'base:conditions', key: 'conditions', label: 'Condiciones', sizeField: 'conditionsPx', alignField: 'conditionsAlign' },
      { id: 'base:sign', key: 'sign', label: 'Firmas', sizeField: 'signPx', alignField: 'signAlign' },
      { id: 'base:footer', key: 'footer', label: 'Footer', sizeField: 'footerPx', alignField: 'footerAlign' }
    ]);
    const PDF_EDITOR_CONTENT_FIELDS = Object.freeze({
      quote: [
        { key: 'quickLeftTitle', label: 'Título notas izquierda', type: 'text', max: 80 },
        { key: 'quickLeftLines', label: 'Notas izquierda (1 línea por renglón)', type: 'textarea', rows: 4, max: 1200 },
        { key: 'quickRightTitle', label: 'Título bloque derecho', type: 'text', max: 80 },
        { key: 'quickRightBody', label: 'Texto bloque derecho', type: 'textarea', rows: 3, max: 700 },
        { key: 'conditionsTitle', label: 'Título de condiciones', type: 'text', max: 120 },
        { key: 'conditionsLines', label: 'Condiciones (1 línea por punto)', type: 'textarea', rows: 8, max: 5000 },
        { key: 'annexHintTitle', label: 'Título de anexos', type: 'text', max: 120 },
        { key: 'annexHintBody', label: 'Texto de anexos', type: 'textarea', rows: 3, max: 900 }
      ],
      order: [
        { key: 'annexHintTitle', label: 'Título de anexos', type: 'text', max: 120 },
        { key: 'annexHintBody', label: 'Texto de anexos', type: 'textarea', rows: 4, max: 900 }
      ],
      receipt: [
        { key: 'liquidatedTitle', label: 'Título constancia liquidada', type: 'text', max: 120 },
        { key: 'liquidatedFooterLine1', label: 'Footer liquidada línea 1', type: 'text', max: 180 },
        { key: 'liquidatedFooterLine2', label: 'Footer liquidada línea 2', type: 'text', max: 180 },
        { key: 'receiptTitle', label: 'Título recibo normal', type: 'text', max: 120 },
        { key: 'receiptFooterLine1', label: 'Footer recibo línea 1', type: 'text', max: 180 },
        { key: 'receiptFooterLine2', label: 'Footer recibo línea 2', type: 'text', max: 180 },
        { key: 'annexHintTitle', label: 'Título de anexos', type: 'text', max: 120 },
        { key: 'annexHintBody', label: 'Texto de anexos', type: 'textarea', rows: 3, max: 900 }
      ],
      contract: [
        { key: 'annexHintTitle', label: 'Título de anexos', type: 'text', max: 120 },
        { key: 'annexHintBody', label: 'Texto de anexos', type: 'textarea', rows: 4, max: 900 }
      ],
      dictamen: [
        { key: 'dictamenTitle', label: 'Título del dictamen', type: 'text', max: 120 },
        { key: 'dictamenNotes', label: 'Observaciones generales', type: 'textarea', rows: 4, max: 2000 },
        { key: 'annexHintTitle', label: 'Título de anexos', type: 'text', max: 120 },
        { key: 'annexHintBody', label: 'Texto de anexos', type: 'textarea', rows: 4, max: 900 }
      ]
    });
    let pdfEditorControlsBound = false;

    function clampPdfEditorNumber(value, min, max, fallback) {
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(min, parsed));
    }

    function normalizePdfEditorAlign(value, fallback = 'left') {
      const safe = String(value || '').toLowerCase();
      return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
    }

    function normalizePdfEditorHex(value, fallback) {
      const raw = String(value || '').trim();
      const candidate = raw.startsWith('#') ? raw : `#${raw}`;
      return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
    }

    function escapePdfEditorHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getPdfEditorAccent() {
      return currentTenant === 'cp' ? '#c1621e' : '#d32f2f';
    }

    function getPdfEditorDefaultContent(type, tenant = currentTenant) {
      const docType = String(type || 'quote').toLowerCase();
      const isCP = tenant === 'cp';
      const pmDefaults = {
        quote: {
          quickLeftTitle: 'Condiciones:',
          quickLeftLines: 'a) Pago anticipado.\nb) Doc. completa 3 semanas antes.\nc) Sujeto a disponibilidad.',
          quickRightTitle: 'Vigencia:',
          quickRightBody: '7 días naturales a partir de la emisión.',
          conditionsTitle: 'CONDICIONES GENERALES',
          conditionsLines: [
            'La instalación será responsabilidad exclusiva del cliente. Esto incluye mano de obra, herramientas y materiales necesarios.',
            'El diseño y contenido del material publicitario deben cumplir con las normativas establecidas por Plaza Mayor.',
            'El cliente es completamente responsable del contenido del material publicitario y de no infringir derechos de terceros.',
            'Durante instalación and desinstalación, el cliente será responsable de cualquier daño al espacio o propiedad del centro comercial.',
            'Cualquier modificación en duración, diseño o ubicación del material publicitario debe ser comunicada and aprobada con anticipación.',
            'No se permite volanteo fuera del espacio designado ni perifoneo/música sin autorización escrita de Mercadotecnia.',
            'Al finalizar la campaña, el cliente deberá retirar el material publicitario a más tardar al día siguiente.',
            'No se permite la venta ni promoción de artículos para adultos, bebidas alcohólicas, tabaco, CBD y/o cannabinoides.',
            'El almacenamiento y/o recolección de basura correrá por cuenta del cliente.',
            'El cliente deberá instalar la toma eléctrica necesaria. Plaza Mayor puede suministrar energía 110v para uso moderado previa autorización.',
            'Esta es una propuesta económica. Condiciones generales y específicas finales se establecerán en el contrato.'
          ].join('\n'),
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        order: {
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        receipt: {
          liquidatedTitle: 'Constancia de Liquidación',
          liquidatedFooterLine1: 'Este documento certifica que la orden de referencia ha sido liquidada en su totalidad.',
          liquidatedFooterLine2: 'Generado digitalmente a través de Marketing Hub.',
          receiptTitle: 'Recibo de Pago',
          receiptFooterLine1: 'Este documento es un comprobante de pago interno. No válido como factura fiscal.',
          receiptFooterLine2: 'Generado digitalmente a través de Marketing Hub.',
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        contract: {
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        dictamen: {
          dictamenTitle: 'Dictamen de Expediente',
          dictamenNotes: 'El presente dictamen certifica el estado actual de cumplimiento del expediente digital del cliente.',
          annexHintTitle: 'Anexos del Dictamen',
          annexHintBody: 'Información complementaria relevante para la validación del expediente.'
        }
      };
      const cpDefaults = {
        quote: {
          quickLeftTitle: 'Notas:',
          quickLeftLines: 'a) Incluye insumos en baños (papel y jabón).\nb) Uso del espacio por 7 horas + montaje/desmontaje mismo día.\nc) Premontaje: 25% sobre el valor base del día elegido.',
          quickRightTitle: 'Vigencia:',
          quickRightBody: '15 días desde la emisión (tarifa sujeta a disponibilidad del espacio).',
          conditionsTitle: 'CONDICIONES GENERALES',
          conditionsLines: [
            'Todo proveedor deberá ser aprobado previamente por Casa de Piedra.',
            'Carpas: proveedor exclusivo Carpas San Marino (472 595 05 34 / 477 787 85 19).',
            'Es indispensable contratar generador de energía externo para evitar contratiempos.',
            'Baños con atención personalizada and seguridad exclusiva se contratan por separado.',
            'Si cancela el cliente, se penaliza con 100% del anticipo.',
            'Cambios de fecha o servicios están sujetos a disponibilidad and pueden generar ajustes de costo.',
            'Estacionamiento de cortesía. Valet Parking se cotiza aparte con proveedor autorizado.'
          ].join('\n'),
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        order: {
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        receipt: {
          liquidatedTitle: 'Constancia de Liquidación',
          liquidatedFooterLine1: 'Este documento certifica que la orden de referencia ha sido liquidada en su totalidad.',
          liquidatedFooterLine2: 'Generado digitalmente a través de Marketing Hub.',
          receiptTitle: 'Recibo de Pago',
          receiptFooterLine1: 'Este documento es un comprobante de pago interno. No válido como factura fiscal.',
          receiptFooterLine2: 'Generado digitalmente a través de Marketing Hub.',
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        contract: {
          annexHintTitle: 'Página adicional editable',
          annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
        },
        dictamen: {
          dictamenTitle: 'Dictamen de Expediente',
          dictamenNotes: 'El presente dictamen certifica el estado actual de cumplimiento del expediente digital del cliente.',
          annexHintTitle: 'Anexos del Dictamen',
          annexHintBody: 'Información complementaria relevante para la validación del expediente.'
        }
      };
      const map = isCP ? cpDefaults : pmDefaults;
      return { ...(map[docType] || map.quote || {}) };
    }

    function normalizePdfEditorContent(raw, type, tenant = currentTenant) {
      const defaults = getPdfEditorDefaultContent(type, tenant);
      const base = raw && typeof raw === 'object' ? raw : {};
      const fields = PDF_EDITOR_CONTENT_FIELDS[type] || [];
      const out = { ...defaults };
      fields.forEach((field) => {
        const incoming = base[field.key];
        if (incoming === undefined || incoming === null) return;
        out[field.key] = String(incoming).slice(0, field.max || 2000);
      });
      return out;
    }

    function normalizePdfEditorTemplates(rawTemplates) {
      const source = rawTemplates && typeof rawTemplates === 'object' ? rawTemplates : {};
      const out = {};
      PDF_EDITOR_DOC_TYPES.forEach((doc) => {
        const rawList = Array.isArray(source[doc.id]) ? source[doc.id] : [];
        out[doc.id] = rawList.slice(0, 40).map((item, idx) => {
          const base = item && typeof item === 'object' ? item : {};
          const id = String(base.id || `tpl_${doc.id}_${Date.now()}_${idx}`);
          const name = String(base.name || `Plantilla ${idx + 1}`).slice(0, 80);
          const styleRaw = base.style && typeof base.style === 'object' ? base.style : {};
          return {
            id,
            name,
            style: normalizePdfEditorStyle(styleRaw, doc.id)
          };
        });
      });
      return out;
    }

    function buildPdfEditorInitialTemplates() {
      const profiles = ensurePdfEditorProfiles(pdfEditorProfiles);
      const makeVariants = (docId) => {
        const base = normalizePdfEditorStyle(profiles[docId], docId);
        const compact = normalizePdfEditorStyle({
          ...base,
          titlePx: Math.max(20, base.titlePx - 2),
          metaPx: Math.max(8, base.metaPx - 1),
          tableBodyPx: Math.max(9, base.tableBodyPx - 1),
          tableHeadPx: Math.max(9, base.tableHeadPx - 1),
          quickPx: Math.max(9, base.quickPx - 1),
          conditionsPx: Math.max(9, base.conditionsPx - 2),
          signPx: Math.max(9, base.signPx - 1),
          lineHeightPct: Math.max(95, base.lineHeightPct - 10)
        }, docId);
        const premium = normalizePdfEditorStyle({
          ...base,
          titlePx: Math.min(42, base.titlePx + 2),
          metaPx: Math.min(18, base.metaPx + 1),
          tableBodyPx: Math.min(16, base.tableBodyPx + 1),
          tableHeadPx: Math.min(18, base.tableHeadPx + 1),
          quickPx: Math.min(16, base.quickPx + 1),
          conditionsPx: Math.min(18, base.conditionsPx + 1),
          signPx: Math.min(16, base.signPx + 1),
          lineHeightPct: Math.min(160, base.lineHeightPct + 8)
        }, docId);
        return [
          { id: `preset_${docId}_base`, name: 'Base', style: base },
          { id: `preset_${docId}_compacta`, name: 'Compacta 1 Hoja', style: compact },
          { id: `preset_${docId}_premium`, name: 'Premium', style: premium }
        ];
      };
      const out = {};
      PDF_EDITOR_DOC_TYPES.forEach((doc) => {
        out[doc.id] = makeVariants(doc.id);
      });
      return out;
    }

    function ensurePdfEditorTemplatesSeeded() {
      const current = normalizePdfEditorTemplates(pdfEditorTemplates);
      const hasSome = Object.values(current).some(list => Array.isArray(list) && list.length > 0);
      if (hasSome) {
        pdfEditorTemplates = current;
        return false;
      }
      pdfEditorTemplates = buildPdfEditorInitialTemplates();
      return true;
    }

    async function loadPdfEditorLetterhead() {
      pdfEditorLetterheadUrl = '';
      try {
        const { data, error } = await getDB()
          .from('configuracion')
          .select('id,valor_json,updated,updated_at,created,created_at')
          .eq('tenant', getCurrentConfigTenant())
          .eq('clave', CFG_LETTERHEAD_KEY);
        if (error) throw error;
        const row = pickLatestConfigRow(Array.isArray(data) ? data : (data ? [data] : []));
        const cfg = parseConfigJson(row?.valor_json);
        const fileName = String(cfg.file_name || '').trim();
        const path = String(cfg.path || cfg.file_path || '').trim() || (fileName ? `${DOC_LETTERHEAD_PATH}/${fileName}` : '');
        if (!path) return;
        const signed = await getSignedStorageUrl(path);
        if (signed) pdfEditorLetterheadUrl = signed;
      } catch (_) {}
    }

    function fitPdfEditorPreviewScale() {
      const shell = document.getElementById('adm-pdf-preview-shell');
      const stage = document.getElementById('adm-pdf-preview-stage');
      const page = document.getElementById('adm-pdf-preview-page');
      if (!shell || !stage || !page) return;
      const baseWidth = 816;
      const baseHeight = 1056;
      const availW = Math.max(120, shell.clientWidth - 10);
      const availH = Math.max(140, shell.clientHeight - 10);
      const scale = Math.min(availW / baseWidth, availH / baseHeight, 1);
      pdfEditorPreviewScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      stage.style.width = `${Math.round(baseWidth * pdfEditorPreviewScale)}px`;
      stage.style.height = `${Math.round(baseHeight * pdfEditorPreviewScale)}px`;
      page.style.transform = `scale(${pdfEditorPreviewScale})`;
    }

    function normalizePdfEditorResources(raw) {
      const list = Array.isArray(raw) ? raw : [];
      const accent = getPdfEditorAccent();
      return list.slice(0, 120).map((item, index) => {
        const base = item && typeof item === 'object' ? item : {};
        const type = ['bar', 'title', 'text'].includes(String(base.type || '').toLowerCase())
          ? String(base.type).toLowerCase()
          : 'text';
        return {
          id: String(base.id || `pdfres_${Date.now()}_${index}`),
          type,
          enabled: base.enabled !== false,
          page: clampPdfEditorNumber(base.page, 1, 8, 1),
          x: clampPdfEditorNumber(base.x, -220, 920, 88),
          y: clampPdfEditorNumber(base.y, -220, 1420, 120),
          w: clampPdfEditorNumber(base.w, 16, 940, type === 'bar' ? 260 : 290),
          h: clampPdfEditorNumber(base.h, 10, 1240, type === 'bar' ? 14 : 44),
          text: String(base.text || (type === 'title' ? 'TITULO' : 'Texto editable')).slice(0, 200),
          fontSize: clampPdfEditorNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
          bold: base.bold !== false,
          align: normalizePdfEditorAlign(base.align, 'left'),
          color: normalizePdfEditorHex(base.color, '#111827'),
          bgColor: normalizePdfEditorHex(base.bgColor, type === 'bar' ? accent : '#ffffff')
        };
      });
    }

    function normalizePdfEditorStyle(raw = {}, docType = pdfEditorSelectedType) {
      const resolvedType = PDF_EDITOR_DOC_TYPES.find(doc => doc.id === String(docType || '').toLowerCase())?.id || 'quote';
      const base = { ...PDF_EDITOR_DEFAULTS, ...(raw || {}) };
      const fontKey = String(base.fontFamilyKey || '').toLowerCase();
      return {
        fontFamilyKey: PDF_EDITOR_FONT_MAP[fontKey] ? fontKey : PDF_EDITOR_DEFAULTS.fontFamilyKey,
        headerLinePx: clampPdfEditorNumber(base.headerLinePx, 1, 8, PDF_EDITOR_DEFAULTS.headerLinePx),
        titlePx: clampPdfEditorNumber(base.titlePx, 20, 42, PDF_EDITOR_DEFAULTS.titlePx),
        metaPx: clampPdfEditorNumber(base.metaPx, 8, 18, PDF_EDITOR_DEFAULTS.metaPx),
        tableHeadPx: clampPdfEditorNumber(base.tableHeadPx, 9, 18, PDF_EDITOR_DEFAULTS.tableHeadPx),
        tableBodyPx: clampPdfEditorNumber(base.tableBodyPx, 9, 16, PDF_EDITOR_DEFAULTS.tableBodyPx),
        lineHeightPct: clampPdfEditorNumber(base.lineHeightPct, 90, 180, PDF_EDITOR_DEFAULTS.lineHeightPct),
        quickPx: clampPdfEditorNumber(base.quickPx, 9, 16, PDF_EDITOR_DEFAULTS.quickPx),
        conditionsPx: clampPdfEditorNumber(base.conditionsPx, 9, 18, PDF_EDITOR_DEFAULTS.conditionsPx),
        signPx: clampPdfEditorNumber(base.signPx, 9, 16, PDF_EDITOR_DEFAULTS.signPx),
        footerPx: clampPdfEditorNumber(base.footerPx, 8, 14, PDF_EDITOR_DEFAULTS.footerPx),
        offsetXPx: clampPdfEditorNumber(base.offsetXPx, -120, 120, PDF_EDITOR_DEFAULTS.offsetXPx),
        offsetYPx: clampPdfEditorNumber(base.offsetYPx, -120, 120, PDF_EDITOR_DEFAULTS.offsetYPx),
        extraPages: clampPdfEditorNumber(base.extraPages, -1, 6, PDF_EDITOR_DEFAULTS.extraPages),
        resources: normalizePdfEditorResources(base.resources),
        headerAlign: normalizePdfEditorAlign(base.headerAlign, PDF_EDITOR_DEFAULTS.headerAlign),
        metaAlign: normalizePdfEditorAlign(base.metaAlign, PDF_EDITOR_DEFAULTS.metaAlign),
        tableAlign: normalizePdfEditorAlign(base.tableAlign, PDF_EDITOR_DEFAULTS.tableAlign),
        quickAlign: normalizePdfEditorAlign(base.quickAlign, PDF_EDITOR_DEFAULTS.quickAlign),
        conditionsAlign: normalizePdfEditorAlign(base.conditionsAlign, PDF_EDITOR_DEFAULTS.conditionsAlign),
        signAlign: normalizePdfEditorAlign(base.signAlign, PDF_EDITOR_DEFAULTS.signAlign),
        summaryAlign: normalizePdfEditorAlign(base.summaryAlign, PDF_EDITOR_DEFAULTS.summaryAlign),
        footerAlign: normalizePdfEditorAlign(base.footerAlign, PDF_EDITOR_DEFAULTS.footerAlign),
        content: normalizePdfEditorContent(base.content, resolvedType)
      };
    }

    function ensurePdfEditorProfiles(rawProfiles) {
      const profiles = rawProfiles && typeof rawProfiles === 'object' ? rawProfiles : {};
      const fallback = normalizePdfEditorStyle(
        profiles.default && typeof profiles.default === 'object'
          ? profiles.default
          : (profiles.quote && typeof profiles.quote === 'object' ? profiles.quote : PDF_EDITOR_DEFAULTS),
        'quote'
      );
      const out = {};
      PDF_EDITOR_DOC_TYPES.forEach((doc) => {
        const raw = profiles[doc.id] && typeof profiles[doc.id] === 'object' ? profiles[doc.id] : fallback;
        out[doc.id] = normalizePdfEditorStyle(raw, doc.id);
      });
      return out;
    }

    function getPdfEditorTypeMeta(type) {
      return PDF_EDITOR_DOC_TYPES.find(doc => doc.id === type) || PDF_EDITOR_DOC_TYPES[0];
    }
"""

new_content = content[:line_end] + new_segment + content[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Restoration complete.")
