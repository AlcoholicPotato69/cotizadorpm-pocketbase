(function () {
  const PAGE_SIZES = {
    landscape: { width: 1056, height: 816, label: "Horizontal" },
    portrait: { width: 816, height: 1056, label: "Vertical" }
  };
  const PREVIEW_SCALE = 0.66;

  function safeString(value) {
    return String(value == null ? "" : value);
  }

  function escapeHtml(value) {
    return safeString(value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeAlign(value, fallback) {
    const raw = safeString(value).toLowerCase();
    return ["left", "center", "right", "justify"].includes(raw) ? raw : fallback;
  }

  function normalizeOrientation(value) {
    return safeString(value).toLowerCase() === "portrait" ? "portrait" : "landscape";
  }

  function getPageSize(style) {
    return PAGE_SIZES[normalizeOrientation(style && style.orientation)] || PAGE_SIZES.landscape;
  }

  function normalizeHex(value, fallback) {
    const raw = safeString(value).trim();
    const candidate = raw.startsWith("#") ? raw : "#" + raw;
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
  }

  function normalizeResource(resource, index, brandColor) {
    const base = resource && typeof resource === "object" ? resource : {};
    const type = ["bar", "title", "text"].includes(safeString(base.type).toLowerCase())
      ? safeString(base.type).toLowerCase()
      : "text";
    return {
      id: safeString(base.id || "dictamen_editor_" + Date.now() + "_" + index),
      type: type,
      enabled: base.enabled !== false,
      page: clampNumber(base.page, 1, 8, 1),
      x: clampNumber(base.x, -220, 1120, 88),
      y: clampNumber(base.y, -220, 1420, 120),
      w: clampNumber(base.w, 16, 1120, type === "bar" ? 260 : 290),
      h: clampNumber(base.h, 10, 1420, type === "bar" ? 14 : 44),
      text: safeString(base.text || (type === "title" ? "{{DOC_TITLE}}" : "Texto editable")).slice(0, 1200),
      fontSize: clampNumber(base.fontSize, 8, 72, type === "title" ? 24 : 14),
      bold: base.bold !== false,
      locked: base.locked === true,
      align: normalizeAlign(base.align, "left"),
      color: normalizeHex(base.color, "#111827"),
      bgColor: normalizeHex(base.bgColor, type === "bar" ? brandColor : "#ffffff")
    };
  }

  function resolveTemplateText(value, context) {
    let output = safeString(value);
    Object.entries(context && typeof context === "object" ? context : {}).forEach(function (entry) {
      const token = safeString(entry[0]).trim();
      if (!token) return;
      const pattern = new RegExp("\\{\\{\\s*" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\}\\}", "gi");
      output = output.replace(pattern, safeString(entry[1]));
    });
    return output;
  }

  function buildSampleClient(source) {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const sourceClient = source && typeof source === "object" ? source : {};
    return {
      ...sourceClient,
      id: "preview-dictamen-completo",
      nombre_completo: "COMERCIALIZADORA EJEMPLO DEL BAJIO, S.A. DE C.V.",
      correo: "legal@ejemplo.mx",
      telefono: "4771234567",
      rfc: "CEB010101AB1",
      doc_acta_constitutiva: "acta_constitutiva_ejemplo.pdf",
      doc_ine: "ine_representante_ejemplo.pdf",
      doc_comprobante_domicilio: "comprobante_domicilio_ejemplo.pdf",
      doc_constancia_fiscal: "constancia_fiscal_ejemplo.pdf",
      constancia_fiscal_emitida_el: new Date().toISOString().slice(0, 10),
      comprobante_domicilio_emitido_el: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10),
      documentos_estado: {
        doc_acta_constitutiva: { status: "aprobado", subido_at: yesterday, revisado_at: now, aprobado_at: now, revisado_por_nombre: "Validador de Prueba", aprobado_por_nombre: "Validador de Prueba" },
        doc_ine: { status: "aprobado", subido_at: yesterday, revisado_at: now, aprobado_at: now, revisado_por_nombre: "Validador de Prueba", aprobado_por_nombre: "Validador de Prueba" },
        doc_comprobante_domicilio: { status: "aprobado", subido_at: yesterday, revisado_at: now, aprobado_at: now, revisado_por_nombre: "Validador de Prueba", aprobado_por_nombre: "Validador de Prueba" },
        doc_constancia_fiscal: { status: "aprobado", subido_at: yesterday, revisado_at: now, aprobado_at: now, revisado_por_nombre: "Validador de Prueba", aprobado_por_nombre: "Validador de Prueba" }
      },
      expediente_validacion: {
        domicilio: "BLVD. CAMPESTRE 1200, COL. JARDINES DEL MORAL, LEON, GUANAJUATO",
        dictamenJuridico: {
          documentosProtocolizados: {
            sociedad: "COMERCIALIZADORA EJEMPLO DEL BAJIO, S.A. DE C.V.",
            tipoActo: "CONSTITUTIVA",
            fechaActo: "2020-03-18",
            resumen: "CONSTITUCION DE SOCIEDAD MERCANTIL, OBJETO SOCIAL AMPLIO PARA COMERCIALIZACION, SERVICIOS, REPRESENTACION Y ARRENDAMIENTO DE BIENES.",
            fechaInscripcion: "2020-04-02",
            numeroActa: "18452",
            fechaDocumento: "2020-03-20",
            notario: "NOTARIO PUBLICO 32",
            ciudad: "LEON, GUANAJUATO",
            folioMercantil: "N-2020-004521",
            domicilioFiscal: "BLVD. CAMPESTRE 1200, COL. JARDINES DEL MORAL, LEON, GUANAJUATO"
          },
          apoderados: {
            nombreComercial: "EJEMPLO BAJIO",
            apoderado: "MARIA FERNANDA LOPEZ GARCIA",
            facultades: "ACTOS DE ADMINISTRACION, REPRESENTACION LEGAL, CELEBRACION DE CONTRATOS Y GESTIONES ANTE AUTORIDADES.",
            limitaciones: "SIN LIMITACIONES REGISTRADAS EN DOCUMENTACION PRESENTADA.",
            fechaInscripcion: "2020-04-02",
            numeroActa: "18452",
            fechaDocumento: "2020-03-20",
            notario: "NOTARIO PUBLICO 32",
            ciudad: "LEON, GUANAJUATO",
            folioMercantil: "N-2020-004521",
            vigente: "SI",
            terminoVigencia: "INDEFINIDA"
          }
        }
      }
    };
  }

  function createModal(idPrefix) {
    const id = idPrefix + "-dictamen-generator-modal";
    const existing = document.getElementById(id);
    if (existing) return existing;

    const modal = document.createElement("div");
    modal.id = id;
    modal.className = "fixed inset-0 z-[120] hidden bg-slate-950/90 backdrop-blur-md p-3 md:p-5";
    modal.innerHTML = `
      <div class="mx-auto flex h-full max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-900 px-5 py-4 text-white">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">Generador de dictamen PDF</p>
            <h3 data-dg-title class="mt-1 truncate text-sm font-black uppercase">Dictamen juridico</h3>
            <p data-dg-subtitle class="mt-1 truncate text-[11px] font-semibold text-white/55"></p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button data-dg-sample type="button" class="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-white/20">
              <i class="fa-solid fa-flask"></i> Vista prueba completa
            </button>
            <button data-dg-edit-lock type="button" class="hidden rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-lg transition hover:bg-amber-600">
              <i class="fa-solid fa-lock"></i> Desbloquear edición
            </button>
            <button data-dg-save-template type="button" class="hidden rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-white/20">
              <i class="fa-solid fa-cloud-arrow-up"></i> Guardar plantilla
            </button>
            <button data-dg-generate type="button" class="rounded-xl bg-emerald-600 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition hover:bg-emerald-700">
              <i class="fa-solid fa-circle-check"></i> Aprobar
            </button>
            <button data-dg-close type="button" class="rounded-xl bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div data-dg-workspace class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div class="min-h-0 overflow-auto bg-slate-100 p-4">
            <div data-dg-preview class="mx-auto w-fit rounded-2xl bg-white p-4 shadow-xl"></div>
          </div>
          <aside data-dg-editor-panel class="min-h-0 overflow-y-auto border-l border-gray-100 bg-white p-4">
            <div data-dg-helper class="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[11px] font-semibold leading-5 text-red-900">
              Arrastra los recursos sobre el canvas para moverlos. Usa el punto inferior derecho para redimensionar. Al aprobar se guarda el dictamen en el expediente.
            </div>
            <div class="space-y-4">
              <section class="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <p class="mb-3 text-[10px] font-black uppercase tracking-wide text-gray-400">Estilo base</p>
                <label class="mb-3 block text-[10px] font-black uppercase text-gray-500">Fuente
                  <select data-dg-field="fontFamilyKey" class="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700"></select>
                </label>
                <div class="mb-3 block text-[10px] font-black uppercase text-gray-500">Orientacion
                  <label class="mt-1 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold normal-case text-gray-700">
                    <span>Hoja vertical</span>
                    <input data-dg-field="orientation" type="checkbox" class="h-4 w-4 rounded border-gray-300 accent-emerald-600">
                  </label>
                  <p class="mt-1 text-[10px] font-semibold normal-case text-gray-400">Desactivado mantiene el documento horizontal.</p>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  ${["titlePx", "tableHeadPx", "tableBodyPx", "conditionsPx", "footerPx", "lineHeightPct", "offsetXPx", "offsetYPx", "extraPages"].map(function (field) {
                    const labels = {
                      titlePx: "Titulo",
                      tableHeadPx: "Tabla head",
                      tableBodyPx: "Tabla body",
                      conditionsPx: "Notas",
                      footerPx: "Footer",
                      lineHeightPct: "Interlineado",
                      offsetXPx: "Mover X",
                      offsetYPx: "Mover Y",
                      extraPages: "Anexos"
                    };
                    return `<label class="block text-[10px] font-black uppercase text-gray-500">${labels[field]}
                      <input data-dg-field="${field}" type="number" class="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                    </label>`;
                  }).join("")}
                </div>
              </section>
              <section class="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <p class="mb-3 text-[10px] font-black uppercase tracking-wide text-gray-400">Texto de plantilla</p>
                <label class="mb-2 block text-[10px] font-black uppercase text-gray-500">Titulo
                  <input data-dg-content="dictamenTitle" class="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                </label>
                <label class="mb-2 block text-[10px] font-black uppercase text-gray-500">Nombre que firma/genera
                  <input data-dg-content="dictamenSigner" class="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                </label>
                <label class="mb-2 block text-[10px] font-black uppercase text-gray-500">Observaciones
                  <textarea data-dg-content="dictamenNotes" rows="4" class="mt-1 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"></textarea>
                </label>
                <label class="mb-2 block text-[10px] font-black uppercase text-gray-500">Titulo anexos
                  <input data-dg-content="annexHintTitle" class="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                </label>
                <label class="block text-[10px] font-black uppercase text-gray-500">Texto anexos
                  <textarea data-dg-content="annexHintBody" rows="3" class="mt-1 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"></textarea>
                </label>
              </section>
              <section class="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Recursos movibles</p>
                  <div class="flex gap-1">
                    <button data-dg-add-resource="bar" type="button" class="rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-black uppercase text-white">Barra</button>
                    <button data-dg-add-resource="title" type="button" class="rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-black uppercase text-white">Titulo</button>
                    <button data-dg-add-resource="text" type="button" class="rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-black uppercase text-white">Texto</button>
                  </div>
                </div>
                <div data-dg-resources class="space-y-2"></div>
              </section>
            </div>
          </aside>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function makeState(options) {
    const brandColor = safeString(options.brandColor || "#d32f2f");
    const normalized = options.normalizeStyle(options.style || {});
    normalized.orientation = normalizeOrientation(normalized.orientation);
    normalized.resources = (Array.isArray(normalized.resources) ? normalized.resources : []).map(function (res, index) {
      return normalizeResource(res, index, brandColor);
    });
    return {
      idPrefix: safeString(options.idPrefix || "hub"),
      client: options.client,
      previewClient: null,
      sampleClient: typeof options.buildSampleClient === "function" ? options.buildSampleClient(options.client) : buildSampleClient(options.client),
      previewOnlySample: false,
      folio: options.folio,
      filename: options.filename,
      style: normalized,
      brandColor: brandColor,
      fontMap: options.fontMap || {},
      normalizeStyle: options.normalizeStyle,
      buildHtml: options.buildHtml,
      renderPdfBlob: options.renderPdfBlob,
      downloadBlob: options.downloadBlob,
      buildDocumentSnapshot: options.buildDocumentSnapshot,
      persistSnapshot: options.persistSnapshot,
      canSnapshot: options.canSnapshot !== false,
      canSaveTemplate: options.canSaveTemplate === true,
      canEdit: options.canEdit === true || options.canSaveTemplate === true,
      editUnlocked: false,
      saveTemplate: options.saveTemplate,
      showToast: options.showToast || function () {},
      onGenerated: options.onGenerated || function () {}
    };
  }

  function getActiveClient(state) {
    return state.previewOnlySample && state.previewClient ? state.previewClient : state.client;
  }

  function isEditorUnlocked(state) {
    return state && state.canEdit === true && state.editUnlocked === true;
  }

  function isResourceEditable(state, resource) {
    return isEditorUnlocked(state) && resource && resource.locked !== true;
  }

  function buildResourcePreviewHtml(state, pageCount) {
    const resources = Array.isArray(state.style.resources) ? state.style.resources : [];
    const size = getPageSize(state.style);
    const context = {
      CLIENT_NAME: safeString(getActiveClient(state) && getActiveClient(state).nombre_completo),
      CLIENT_RFC: safeString(getActiveClient(state) && getActiveClient(state).rfc),
      FOLIO: safeString(state.folio),
      DOC_TITLE: safeString(state.style.content && state.style.content.dictamenTitle),
      TODAY: new Date().toLocaleDateString("es-MX")
    };
    return resources
      .filter(function (resource) { return resource.enabled; })
      .map(function (resource, index) {
        const page = clampNumber(resource.page, 1, Math.max(1, pageCount), 1);
        const top = ((page - 1) * size.height) + resource.y;
        const selected = state.selectedResourceId === resource.id;
        const editable = isResourceEditable(state, resource);
        const locked = !editable;
        const borderColor = selected ? state.brandColor : (locked ? "rgba(100,116,139,.9)" : "rgba(15,23,42,.65)");
        const common = [
          "left:" + resource.x + "px",
          "top:" + top + "px",
          "width:" + resource.w + "px",
          "height:" + resource.h + "px",
          "box-sizing:border-box",
          "position:absolute",
          "z-index:80",
          "border:2px dashed " + borderColor,
          "outline:" + (selected ? "2px solid " + state.brandColor : "none"),
          "cursor:" + (editable ? "move" : "not-allowed"),
          "pointer-events:auto",
          "box-shadow:0 10px 24px -18px rgba(15,23,42,.55),inset 0 0 0 1px rgba(255,255,255,.45)"
        ].join(";");
        const badge = `<span class="dg-resource-badge" style="position:absolute;left:6px;top:-23px;display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:${locked ? "#334155" : state.brandColor};color:#fff;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;box-shadow:0 8px 16px -12px rgba(15,23,42,.6);pointer-events:none;"><i class="fa-solid ${locked ? "fa-lock" : "fa-up-down-left-right"}"></i>${escapeHtml(resource.type)}</span>`;
        if (resource.type === "bar") {
          return `<div class="dg-canvas-resource ${locked ? "is-locked" : "is-editable"}" data-dg-resource-id="${escapeHtml(resource.id)}" data-dg-resource-index="${index}" style="${common};background:${resource.bgColor};border-radius:2px;">${badge}</div>`;
        }
        const text = resolveTemplateText(resource.text, context);
        return `<div class="dg-canvas-resource ${locked ? "is-locked" : "is-editable"}" data-dg-resource-id="${escapeHtml(resource.id)}" data-dg-resource-index="${index}" style="${common};background:${resource.bgColor};color:${resource.color};font-size:${resource.fontSize}px;font-weight:${resource.bold ? 800 : 500};line-height:1.2;text-align:${resource.align};padding:4px 6px;white-space:pre-wrap;overflow:visible;border-radius:2px;"><div style="width:100%;height:100%;overflow:hidden;">${escapeHtml(text)}</div>${badge}</div>`;
      })
      .join("");
  }

  function extractPreviewHtml(fullHtml, state) {
    try {
      const doc = new DOMParser().parseFromString(fullHtml, "text/html");
      const style = doc.querySelector("style");
      const root = doc.querySelector(".dictamen-pdf-root");
      if (!root) return fullHtml;
      const size = getPageSize(state.style);
      const pageCount = Math.max(1, root.querySelectorAll(".dictamen-pdf-page").length || 1);
      const stageWidth = Math.ceil(size.width * PREVIEW_SCALE);
      const stageHeight = Math.ceil(size.height * pageCount * PREVIEW_SCALE);
      if (!state.canEdit) {
        return `
          ${style ? style.outerHTML : ""}
          <div data-dg-canvas-stage style="position:relative;width:${stageWidth}px;height:${stageHeight}px;margin:0 auto;background:#e2e8f0;border-radius:14px;box-shadow:0 22px 40px -26px rgba(15,23,42,.65);overflow:hidden;">
            <div style="position:absolute;left:0;top:0;width:${size.width}px;transform:scale(${PREVIEW_SCALE});transform-origin:top left;">${root.outerHTML}</div>
          </div>`;
      }
      return `
        ${style ? style.outerHTML : ""}
        <style>
          .dictamen-render-resource{display:none!important}
          .dg-canvas-resource.is-editable::after{content:'';position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;border-radius:999px;background:${state.brandColor};border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.3);cursor:nwse-resize}
          .dg-canvas-resource.is-locked{opacity:.94}
        </style>
        <div data-dg-canvas-stage style="position:relative;width:${stageWidth}px;height:${stageHeight}px;margin:0 auto;background:#e2e8f0;border-radius:14px;box-shadow:0 22px 40px -26px rgba(15,23,42,.65);overflow:hidden;">
          <div style="position:absolute;left:0;top:0;width:${size.width}px;transform:scale(${PREVIEW_SCALE});transform-origin:top left;">${root.outerHTML}</div>
          <div data-dg-resource-layer style="position:absolute;left:0;top:0;width:${size.width}px;height:${size.height * pageCount}px;transform:scale(${PREVIEW_SCALE});transform-origin:top left;pointer-events:none;">
            ${buildResourcePreviewHtml(state, pageCount)}
          </div>
        </div>`;
    } catch (_) {
      return fullHtml;
    }
  }

  function writeControls(modal, state) {
    const style = state.style || {};
    const content = style.content || {};
    const title = modal.querySelector("[data-dg-title]");
    const subtitle = modal.querySelector("[data-dg-subtitle]");
    const saveButton = modal.querySelector("[data-dg-save-template]");
    if (title) title.textContent = safeString(state.filename || "Dictamen juridico");
    if (subtitle) subtitle.textContent = "Folio " + safeString(state.folio || "--");
    if (saveButton) saveButton.classList.toggle("hidden", !state.canEdit || !state.canSaveTemplate || typeof state.saveTemplate !== "function");

    const fontSelect = modal.querySelector('[data-dg-field="fontFamilyKey"]');
    if (fontSelect) {
      const labels = { segoe: "Segoe UI", arial: "Arial", verdana: "Verdana", georgia: "Georgia", times: "Times New Roman", trebuchet: "Trebuchet" };
      fontSelect.innerHTML = Object.keys(state.fontMap || {}).map(function (key) {
        return `<option value="${escapeHtml(key)}">${escapeHtml(labels[key] || key)}</option>`;
      }).join("");
    }

    modal.querySelectorAll("[data-dg-field]").forEach(function (input) {
      const field = input.getAttribute("data-dg-field");
      if (field === "fontFamilyKey") input.value = style.fontFamilyKey || "segoe";
      else if (field === "orientation") {
        if (input.type === "checkbox") input.checked = normalizeOrientation(style.orientation) === "portrait";
        else input.value = normalizeOrientation(style.orientation);
      }
      else input.value = style[field] == null ? "" : style[field];
    });
    modal.querySelectorAll("[data-dg-content]").forEach(function (input) {
      const field = input.getAttribute("data-dg-content");
      input.value = content[field] == null ? "" : content[field];
    });
    syncSampleModeUi(modal, state);
    syncEditorModeUi(modal, state);
    renderResources(modal, state);
  }

  function readControls(modal, state) {
    if (!state.canEdit) return;
    const current = state.style || {};
    const content = { ...(current.content || {}) };
    modal.querySelectorAll("[data-dg-content]").forEach(function (input) {
      const field = input.getAttribute("data-dg-content");
      content[field] = input.value;
    });
    const next = { ...current, content: content };
    modal.querySelectorAll("[data-dg-field]").forEach(function (input) {
      const field = input.getAttribute("data-dg-field");
      if (field === "orientation") {
        next[field] = input.type === "checkbox"
          ? (input.checked ? "portrait" : "landscape")
          : normalizeOrientation(input.value);
      }
      else next[field] = input.value;
    });
    next.resources = current.resources || [];
    state.style = state.normalizeStyle(next);
    state.style.orientation = normalizeOrientation(state.style.orientation);
  }

  function syncEditorModeUi(modal, state) {
    const canEdit = state.canEdit === true;
    const unlocked = isEditorUnlocked(state);
    const panel = modal.querySelector("[data-dg-editor-panel]");
    const workspace = modal.querySelector("[data-dg-workspace]");
    const lockButton = modal.querySelector("[data-dg-edit-lock]");
    const saveButton = modal.querySelector("[data-dg-save-template]");
    if (panel) panel.classList.toggle("hidden", !canEdit);
    if (workspace) {
      workspace.className = canEdit
        ? "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px]"
        : "grid min-h-0 flex-1 grid-cols-1";
    }
    if (lockButton) {
      lockButton.classList.toggle("hidden", !canEdit);
      lockButton.classList.toggle("bg-amber-500", !unlocked);
      lockButton.classList.toggle("hover:bg-amber-600", !unlocked);
      lockButton.classList.toggle("bg-emerald-600", unlocked);
      lockButton.classList.toggle("hover:bg-emerald-700", unlocked);
      lockButton.innerHTML = unlocked
        ? '<i class="fa-solid fa-lock-open"></i> Edición activa'
        : '<i class="fa-solid fa-lock"></i> Desbloquear edición';
    }
    if (saveButton) saveButton.classList.toggle("hidden", !canEdit || !state.canSaveTemplate || typeof state.saveTemplate !== "function");
    modal.querySelectorAll("[data-dg-field],[data-dg-content]").forEach(function (input) {
      input.disabled = !unlocked;
      input.classList.toggle("opacity-60", !unlocked);
      input.classList.toggle("cursor-not-allowed", !unlocked);
    });
    modal.querySelectorAll("[data-dg-add-resource]").forEach(function (button) {
      button.disabled = !unlocked;
      button.classList.toggle("opacity-50", !unlocked);
      button.classList.toggle("cursor-not-allowed", !unlocked);
    });
  }

  function syncSampleModeUi(modal, state) {
    const sampleButton = modal.querySelector("[data-dg-sample]");
    const helper = modal.querySelector("[data-dg-helper]");
    const generateButton = modal.querySelector("[data-dg-generate]");
    if (sampleButton) {
      sampleButton.classList.toggle("bg-amber-500", state.previewOnlySample === true);
      sampleButton.classList.toggle("text-white", state.previewOnlySample === true);
      sampleButton.innerHTML = state.previewOnlySample
        ? '<i class="fa-solid fa-user-check"></i> Volver a cliente real'
        : '<i class="fa-solid fa-flask"></i> Vista prueba completa';
    }
    if (helper) {
      if (!state.canEdit) {
        helper.textContent = "Vista previa segura. Este usuario puede revisar y descargar, pero no editar la plantilla del PDF.";
        helper.className = "mb-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-[11px] font-semibold leading-5 text-sky-900";
      } else if (state.previewOnlySample) {
        helper.textContent = "Estas viendo datos completos de prueba. Si descargas este ejemplo no se guardara snapshot ni se anexara al expediente.";
        helper.className = "mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[11px] font-semibold leading-5 text-amber-900";
      } else if (!isEditorUnlocked(state)) {
        helper.textContent = "El editor esta bloqueado para evitar movimientos accidentales. Usa el candado superior para desbloquear y mover o modificar recursos.";
        helper.className = "mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold leading-5 text-slate-700";
      } else {
        helper.textContent = "Edicion activa: arrastra los recuadros sobre el canvas para moverlos. Usa el punto inferior derecho para redimensionar. Puedes bloquear cada recurso con su candado.";
        helper.className = "mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[11px] font-semibold leading-5 text-red-900";
      }
    }
    if (generateButton) {
      generateButton.innerHTML = state.previewOnlySample
        ? '<i class="fa-solid fa-file-arrow-down"></i> Descargar ejemplo'
        : '<i class="fa-solid fa-circle-check"></i> Aprobar';
    }
  }

  function renderResources(modal, state) {
    const host = modal.querySelector("[data-dg-resources]");
    if (!host) return;
    const resources = Array.isArray(state.style.resources) ? state.style.resources : [];
    if (!resources.length) {
      host.innerHTML = '<p class="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-[11px] font-semibold text-gray-400">Sin recursos extra. Agrega una barra, titulo o texto y muevelo sobre el canvas.</p>';
      return;
    }
    host.innerHTML = resources.map(function (res, index) {
      const selected = state.selectedResourceId === res.id;
      const unlocked = isEditorUnlocked(state);
      const editable = unlocked && res.locked !== true;
      const lockedLabel = res.locked ? "Bloqueado" : "Libre";
      return `
        <div class="rounded-xl border ${selected ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white"} p-3 ${editable ? "" : "opacity-90"}" data-dg-resource-row="${index}">
          <div class="mb-2 flex items-center justify-between gap-2">
            <label class="flex items-center gap-2 text-[10px] font-black uppercase text-gray-500">
              <input type="checkbox" data-dg-resource-field="enabled" ${res.enabled ? "checked" : ""} ${editable ? "" : "disabled"}> ${escapeHtml(res.type)}
            </label>
            <div class="flex items-center gap-1">
              <button type="button" data-dg-toggle-resource-lock="${index}" class="rounded-lg ${res.locked ? "bg-slate-800 text-white" : "bg-emerald-50 text-emerald-700"} px-2 py-1 text-[10px] font-black uppercase" ${unlocked ? "" : "disabled"}>
                <i class="fa-solid ${res.locked ? "fa-lock" : "fa-lock-open"}"></i> ${lockedLabel}
              </button>
              <button type="button" data-dg-remove-resource="${index}" class="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600 ${editable ? "" : "opacity-50 cursor-not-allowed"}" ${editable ? "" : "disabled"}>Eliminar</button>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            ${["page", "x", "y", "w", "h", "fontSize"].map(function (field) {
              return `<label class="text-[9px] font-black uppercase text-gray-400">${field}<input data-dg-resource-field="${field}" value="${escapeHtml(res[field])}" class="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-bold ${editable ? "" : "opacity-60 cursor-not-allowed"}" ${editable ? "" : "disabled"}></label>`;
            }).join("")}
          </div>
          <div class="mt-2 grid grid-cols-3 gap-2">
            <label class="text-[9px] font-black uppercase text-gray-400">Color<input type="color" data-dg-resource-field="color" value="${escapeHtml(res.color)}" class="mt-1 h-7 w-full rounded border border-gray-200 ${editable ? "" : "opacity-60 cursor-not-allowed"}" ${editable ? "" : "disabled"}></label>
            <label class="text-[9px] font-black uppercase text-gray-400">Fondo<input type="color" data-dg-resource-field="bgColor" value="${escapeHtml(res.bgColor)}" class="mt-1 h-7 w-full rounded border border-gray-200 ${editable ? "" : "opacity-60 cursor-not-allowed"}" ${editable ? "" : "disabled"}></label>
            <label class="text-[9px] font-black uppercase text-gray-400">Alineacion<select data-dg-resource-field="align" class="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-bold ${editable ? "" : "opacity-60 cursor-not-allowed"}" ${editable ? "" : "disabled"}>
              ${["left", "center", "right", "justify"].map(function (align) {
                return `<option value="${align}" ${res.align === align ? "selected" : ""}>${align}</option>`;
              }).join("")}
            </select></label>
          </div>
          <textarea data-dg-resource-field="text" rows="2" class="mt-2 w-full resize-y rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-semibold ${editable ? "" : "opacity-60 cursor-not-allowed"}" ${editable ? "" : "disabled"}>${escapeHtml(res.text)}</textarea>
        </div>`;
    }).join("");
  }

  function renderPreview(modal, state) {
    const preview = modal.querySelector("[data-dg-preview]");
    if (!preview) return;
    const html = state.buildHtml(getActiveClient(state), state.folio, state.style);
    preview.innerHTML = extractPreviewHtml(html, state);
  }

  function findResource(state, id) {
    const resources = Array.isArray(state.style.resources) ? state.style.resources : [];
    return resources.find(function (resource) { return resource.id === id; }) || null;
  }

  function mutateResource(state, id, updater) {
    const resources = Array.isArray(state.style.resources) ? state.style.resources.slice() : [];
    const index = resources.findIndex(function (resource) { return resource.id === id; });
    if (index < 0) return;
    const next = updater({ ...resources[index] });
    resources[index] = normalizeResource(next, index, state.brandColor);
    state.style = state.normalizeStyle({ ...state.style, resources: resources });
    state.style.orientation = normalizeOrientation(state.style.orientation);
  }

  function bindModal(modal) {
    if (modal.__dictamenGeneratorBound) return;
    modal.__dictamenGeneratorBound = true;
    modal.addEventListener("input", function (event) {
      const state = modal.__dictamenGeneratorState;
      if (!state || !event.target.closest("[data-dg-field],[data-dg-content],[data-dg-resource-field]")) return;
      if (!isEditorUnlocked(state)) return;
      const row = event.target.closest("[data-dg-resource-row]");
      if (row) {
        const index = parseInt(row.getAttribute("data-dg-resource-row"), 10);
        const field = event.target.getAttribute("data-dg-resource-field");
        const resources = Array.isArray(state.style.resources) ? state.style.resources.slice() : [];
        const resource = resources[index];
        if (resource && field) {
          resource[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
          state.style.resources = resources.map(function (res, resIndex) {
            return normalizeResource(res, resIndex, state.brandColor);
          });
        }
      } else {
        readControls(modal, state);
      }
      renderPreview(modal, state);
    });
    modal.addEventListener("change", function (event) {
      const state = modal.__dictamenGeneratorState;
      if (!state) return;
      if (!isEditorUnlocked(state)) return;
      if (event.target.closest("[data-dg-field],[data-dg-content]")) {
        readControls(modal, state);
        renderPreview(modal, state);
      }
    });
    modal.addEventListener("mousedown", function (event) {
      const state = modal.__dictamenGeneratorState;
      const node = event.target.closest(".dg-canvas-resource");
      if (!state || !node) return;
      if (!isEditorUnlocked(state)) return;
      const id = node.getAttribute("data-dg-resource-id");
      const resource = findResource(state, id);
      if (!resource) return;
      if (resource.locked) {
        state.showToast("Este recurso esta bloqueado. Desbloquealo desde el panel lateral.", "info");
        return;
      }
      const rect = node.getBoundingClientRect();
      const edge = window.PdfEditorHitbox?.isBottomRightResizeHit
        ? window.PdfEditorHitbox.isBottomRightResizeHit(node, event)
        : ((rect.right - event.clientX <= 18) && (rect.bottom - event.clientY <= 18));
      state.selectedResourceId = id;
      modal.__dictamenDragState = {
        id: id,
        mode: edge ? "resize" : "move",
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: resource.x, y: resource.y, w: resource.w, h: resource.h },
        current: { x: resource.x, y: resource.y, w: resource.w, h: resource.h },
        node: node
      };
      renderResources(modal, state);
      event.preventDefault();
    });
    document.addEventListener("mousemove", function (event) {
      const drag = modal.__dictamenDragState;
      const state = modal.__dictamenGeneratorState;
      if (!drag || !state) return;
      const deltaX = (event.clientX - drag.startX) / PREVIEW_SCALE;
      const deltaY = (event.clientY - drag.startY) / PREVIEW_SCALE;
      const next = { ...drag.origin };
      if (drag.mode === "resize") {
        next.w = clampNumber(drag.origin.w + deltaX, 16, 1120, drag.origin.w);
        next.h = clampNumber(drag.origin.h + deltaY, 10, 1420, drag.origin.h);
      } else {
        next.x = clampNumber(drag.origin.x + deltaX, -220, 1120, drag.origin.x);
        next.y = clampNumber(drag.origin.y + deltaY, -220, 1420, drag.origin.y);
      }
      drag.current = next;
      if (drag.node) {
        const size = getPageSize(state.style);
        const resource = findResource(state, drag.id);
        const page = clampNumber(resource ? resource.page : 1, 1, 8, 1);
        drag.node.style.left = next.x + "px";
        drag.node.style.top = (((page - 1) * size.height) + next.y) + "px";
        drag.node.style.width = next.w + "px";
        drag.node.style.height = next.h + "px";
      }
    });
    document.addEventListener("mouseup", function () {
      const drag = modal.__dictamenDragState;
      const state = modal.__dictamenGeneratorState;
      if (!drag || !state) return;
      modal.__dictamenDragState = null;
      mutateResource(state, drag.id, function (resource) {
        return { ...resource, ...(drag.current || drag.origin) };
      });
      renderResources(modal, state);
      renderPreview(modal, state);
    });
    modal.addEventListener("click", async function (event) {
      const state = modal.__dictamenGeneratorState;
      if (!state) return;
      if (event.target.closest("[data-dg-close]")) {
        modal.classList.add("hidden");
        return;
      }
      if (event.target.closest("[data-dg-edit-lock]")) {
        if (!state.canEdit) return;
        if (state.editUnlocked) readControls(modal, state);
        state.editUnlocked = !state.editUnlocked;
        syncSampleModeUi(modal, state);
        syncEditorModeUi(modal, state);
        renderResources(modal, state);
        renderPreview(modal, state);
        return;
      }
      if (event.target.closest("[data-dg-sample]")) {
        state.previewOnlySample = !state.previewOnlySample;
        state.previewClient = state.previewOnlySample ? state.sampleClient : null;
        syncSampleModeUi(modal, state);
        renderPreview(modal, state);
        return;
      }
      const addButton = event.target.closest("[data-dg-add-resource]");
      if (addButton) {
        if (!isEditorUnlocked(state)) return;
        const type = addButton.getAttribute("data-dg-add-resource");
        const resources = Array.isArray(state.style.resources) ? state.style.resources.slice() : [];
        const size = getPageSize(state.style);
        resources.push(normalizeResource({
          type: type,
          x: Math.round(size.width * 0.12),
          y: Math.round(size.height * 0.14),
          bgColor: type === "bar" ? state.brandColor : "#ffffff"
        }, resources.length, state.brandColor));
        state.style = state.normalizeStyle({ ...state.style, resources: resources });
        state.style.orientation = normalizeOrientation(state.style.orientation);
        state.selectedResourceId = resources[resources.length - 1].id;
        renderResources(modal, state);
        renderPreview(modal, state);
        return;
      }
      const removeButton = event.target.closest("[data-dg-remove-resource]");
      if (removeButton) {
        if (!isEditorUnlocked(state)) return;
        const index = parseInt(removeButton.getAttribute("data-dg-remove-resource"), 10);
        const targetResource = (Array.isArray(state.style.resources) ? state.style.resources : [])[index];
        if (targetResource && targetResource.locked) return;
        const resources = (Array.isArray(state.style.resources) ? state.style.resources : []).filter(function (_res, resIndex) {
          return resIndex !== index;
        });
        state.style = state.normalizeStyle({ ...state.style, resources: resources });
        state.style.orientation = normalizeOrientation(state.style.orientation);
        renderResources(modal, state);
        renderPreview(modal, state);
        return;
      }
      const resourceLockButton = event.target.closest("[data-dg-toggle-resource-lock]");
      if (resourceLockButton) {
        if (!isEditorUnlocked(state)) return;
        const index = parseInt(resourceLockButton.getAttribute("data-dg-toggle-resource-lock"), 10);
        const resources = Array.isArray(state.style.resources) ? state.style.resources.slice() : [];
        if (!resources[index]) return;
        resources[index] = normalizeResource({ ...resources[index], locked: !resources[index].locked }, index, state.brandColor);
        state.style = state.normalizeStyle({ ...state.style, resources: resources });
        state.style.orientation = normalizeOrientation(state.style.orientation);
        state.selectedResourceId = resources[index].id;
        renderResources(modal, state);
        renderPreview(modal, state);
        return;
      }
      if (event.target.closest("[data-dg-save-template]")) {
        if (!state.canEdit || !state.canSaveTemplate || typeof state.saveTemplate !== "function") return;
        try {
          readControls(modal, state);
          await state.saveTemplate(state.style);
          state.showToast("Plantilla de dictamen guardada.", "success");
        } catch (error) {
          console.error(error);
          state.showToast("No se pudo guardar la plantilla.", "error");
        }
        return;
      }
      if (event.target.closest("[data-dg-generate]")) {
        await generateFromState(modal, state);
      }
    });
  }

  async function generateFromState(modal, state) {
    const button = modal.querySelector("[data-dg-generate]");
    const isSample = state.previewOnlySample === true;
    try {
      readControls(modal, state);
      syncSampleModeUi(modal, state);
      if (button) {
        button.disabled = true;
        button.innerHTML = isSample
          ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Generando...'
          : '<i class="fa-solid fa-circle-notch fa-spin"></i> Aprobando...';
      }
      const activeClient = getActiveClient(state);
      const filename = isSample ? ("EJEMPLO-" + safeString(state.filename || "dictamen.pdf")) : state.filename;
      const html = state.buildHtml(activeClient, state.folio, state.style);
      if (!window.html2pdf) {
        const popup = window.open("", "_blank", "noopener,noreferrer,width=1080,height=820");
        if (!popup) throw new Error("Permite las ventanas emergentes para abrir el dictamen.");
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        return;
      }
      const blob = await state.renderPdfBlob(html, filename);
      if (!isSample && state.canSnapshot && typeof state.persistSnapshot === "function") {
        try {
          const snapshot = typeof state.buildDocumentSnapshot === "function" ? state.buildDocumentSnapshot(state.client) : [];
          const saved = await state.persistSnapshot(state.client, state.folio, blob, state.filename, snapshot);
          if (saved && saved.saved) state.showToast("Dictamen aprobado y guardado en el expediente.", "success");
          else if (saved && saved.reason === "unchanged") state.showToast("No hubo cambios en documentos; no se genero un nuevo dictamen.", "info");
        } catch (snapshotError) {
          console.error(snapshotError);
          state.showToast("El PDF se genero, pero no se pudo aprobar el dictamen.", "error");
        }
      } else if (isSample) {
        state.showToast("Ejemplo descargado sin guardar snapshot.", "info");
      }
      state.downloadBlob(blob, filename);
      if (!isSample) state.onGenerated(state);
    } catch (error) {
      console.error(error);
      state.showToast(error.message || "No se pudo generar el dictamen.", "error");
    } finally {
      if (button) {
        button.disabled = false;
        syncSampleModeUi(modal, state);
      }
    }
  }

  async function open(options) {
    if (!options || typeof options.buildHtml !== "function" || typeof options.normalizeStyle !== "function") {
      throw new Error("Configuracion de generador de dictamen incompleta.");
    }
    const state = makeState(options);
    const modal = createModal(state.idPrefix);
    modal.__dictamenGeneratorState = state;
    bindModal(modal);
    writeControls(modal, state);
    renderPreview(modal, state);
    modal.classList.remove("hidden");
  }

  window.HubDictamenGenerator = { open: open };
})();
