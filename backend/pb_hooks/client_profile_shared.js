(function () {
  /*
   * Indice rapido de mantenimiento
   * 1. Sanitizacion y utilidades base
   * 2. Validacion de archivos y cuarentena de seguridad
   * 3. Evaluacion del expediente del cliente
   * 4. Endpoints publicos de client_profile
   * 5. Sincronizacion de espejos documentales y dictamenes
   *
   * Funciones tocadas en este mantenimiento:
   * - scanBytesInQuarantine
   * - handlePublicClientProfileComplete
   */
  const AUTH_COLLECTION = "app_users";
  const DOC_FIELDS = [
    "doc_acta_constitutiva",
    "doc_ine",
    "doc_comprobante_domicilio",
    "doc_constancia_fiscal"
  ];
  const REQUIRED_DOC_FIELDS_BY_TENANT = {
    plaza_mayor: [
      "doc_acta_constitutiva",
      "doc_ine",
      "doc_comprobante_domicilio",
      "doc_constancia_fiscal"
    ],
    casa_de_piedra: [
      "doc_ine",
      "doc_comprobante_domicilio",
      "doc_constancia_fiscal"
    ]
  };
  const DOC_LABELS = {
    doc_acta_constitutiva: "Acta constitutiva",
    doc_ine: "INE",
    doc_comprobante_domicilio: "Comprobante de domicilio",
    doc_constancia_fiscal: "Constancia de situacion fiscal"
  };
  const DOC_ALLOWED_EXTENSIONS = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"]
  };
  const DANGEROUS_FILE_EXTENSIONS = {
    ".app": true,
    ".bat": true,
    ".cmd": true,
    ".com": true,
    ".cpl": true,
    ".dll": true,
    ".exe": true,
    ".hta": true,
    ".js": true,
    ".jse": true,
    ".lnk": true,
    ".msi": true,
    ".ps1": true,
    ".scr": true,
    ".sh": true,
    ".vbe": true,
    ".vbs": true,
    ".wsf": true
  };
  const MAX_DOC_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_CONSTANCIA_VALID_DAYS = 30;
  const MAX_COMPROBANTE_VALID_DAYS = null;
  const MAX_COMPROBANTE_VALID_MONTHS = 3;
  const CLIENT_DOCUMENT_MIRROR_TYPE = "otro";
  const CLIENT_DOCUMENT_REQUIREMENTS_CONFIG_KEY = "client_document_requirements";
  const CUSTOM_DOC_UPLOAD_PREFIX = "extra_doc__";
  const CLIENT_PROFILE_LINK_DURATION_SECONDS = 48 * 60 * 60;
  const CLIENT_PROFILE_LINK_SECRET_ENV = "PB_CLIENT_PROFILE_LINK_SECRET";
  const CLIENT_PROFILE_LINK_PURPOSE = "public_client_profile";
  const WINDOWS_DEFENDER_CLI_ENV = "WINDOWS_DEFENDER_CLI";
  const UPLOAD_QUARANTINE_DIR_NAME = "_upload_quarantine";
  const CONTRACT_GENERATION_TAG = "puede_generar_contrato";
  const CONTRACT_GENERATION_LABEL = "Puede generar contrato";
  const DEFAULT_DOCUMENT_DEFINITIONS = {
    plaza_mayor: [
      {
        field: "doc_acta_constitutiva",
        label: "Acta constitutiva",
        description: "PDF completo y legible.",
        icon: "fa-building-circle-check",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: false,
        allowOmit: true,
        builtIn: true,
        accept: ".pdf"
      },
      {
        field: "doc_ine",
        label: "INE o identificación",
        description: "Identificación oficial vigente.",
        icon: "fa-id-card",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: false,
        allowOmit: true,
        builtIn: true,
        accept: ".pdf,.jpg,.jpeg,.png,.webp"
      },
      {
        field: "doc_comprobante_domicilio",
        label: "Comprobante de domicilio",
        description: "Recibo de luz, agua o teléfono vigente.",
        icon: "fa-home",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: true,
        dateField: "comprobante_domicilio_emitido_el",
        validityMode: "calendar_months",
        validityMonths: MAX_COMPROBANTE_VALID_MONTHS,
        allowOmit: true,
        builtIn: true,
        accept: ".pdf,.jpg,.jpeg,.png,.webp"
      },
      {
        field: "doc_constancia_fiscal",
        label: "Constancia de situacion fiscal",
        description: "PDF oficial del SAT.",
        icon: "fa-file-invoice",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: true,
        dateField: "constancia_fiscal_emitida_el",
        validityMode: "days",
        validityDays: MAX_CONSTANCIA_VALID_DAYS,
        allowOmit: false,
        builtIn: true,
        accept: ".pdf"
      }
    ],
    casa_de_piedra: [
      {
        field: "doc_ine",
        label: "INE o Pasaporte",
        description: "Identificación oficial vigente.",
        icon: "fa-id-card",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: false,
        allowOmit: true,
        builtIn: true,
        accept: ".pdf,.jpg,.jpeg,.png,.webp"
      },
      {
        field: "doc_comprobante_domicilio",
        label: "Comprobante de domicilio",
        description: "Recibo de luz, agua o teléfono vigente.",
        icon: "fa-home",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: true,
        dateField: "comprobante_domicilio_emitido_el",
        validityMode: "calendar_months",
        validityMonths: MAX_COMPROBANTE_VALID_MONTHS,
        allowOmit: true,
        builtIn: true,
        accept: ".pdf,.jpg,.jpeg,.png,.webp"
      },
      {
        field: "doc_constancia_fiscal",
        label: "Constancia de situacion fiscal",
        description: "PDF oficial del SAT.",
        icon: "fa-file-invoice",
        requiredForProfile: true,
        requiredForContract: true,
        requiresDate: true,
        dateField: "constancia_fiscal_emitida_el",
        validityMode: "days",
        validityDays: MAX_CONSTANCIA_VALID_DAYS,
        allowOmit: false,
        builtIn: true,
        accept: ".pdf"
      }
    ]
  };
  let notificationsApi = null;
  let defenderCliPathCache = null;
  const TENANT_THEME = {
    plaza_mayor: {
      accent: "#d32f2f",
      accentDark: "#991b1b",
      surface: "#fff7f6",
      name: "Plaza Mayor",
      subtitle: "Expediente de cliente"
    },
    casa_de_piedra: {
      accent: "#c1621e",
      accentDark: "#7c2d12",
      surface: "#fff8ef",
      name: "Casa de Piedra",
      subtitle: "Expediente de cliente"
    }
  };

  function trim(value) {
    return String(value || "").trim();
  }

  function getNotificationsApi() {
    if (notificationsApi !== null) return notificationsApi;
    try {
      notificationsApi = require(`${__hooks}/notifications_shared.js`) || {};
    } catch (err) {
      notificationsApi = {};
      console.log("[client_profile] Notificaciones no disponibles:", String(err));
    }
    return notificationsApi;
  }

  function sanitizeText(value, maxLen) {
    let text = String(value || "").replace(/<[^>]*>/g, "").trim();
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    if (maxLen && text.length > maxLen) text = text.slice(0, maxLen);
    return text;
  }

  function sanitizeId(value) {
    return trim(value).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D+/g, "").slice(-10);
    return digits.length === 10 ? digits : "";
  }

  function normalizeEmail(value) {
    const email = sanitizeText(value, 255).toLowerCase();
    if (!email) return "";
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  }

  function normalizeDate(value) {
    const raw = trim(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) return raw.slice(0, 10);
    return "";
  }

  function normalizeTenant(value) {
    const tenant = trim(value).toLowerCase();
    return (tenant === "plaza_mayor" || tenant === "casa_de_piedra") ? tenant : "";
  }

  function normalizeDocumentFieldKey(value) {
    const raw = trim(value).toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!raw) return "";
    const withPrefix = raw.indexOf("doc_") === 0 ? raw : "doc_custom_" + raw;
    return withPrefix.replace(/_+/g, "_").slice(0, 80);
  }

  function humanizeDocumentFieldLabel(value) {
    const normalized = normalizeDocumentFieldKey(value);
    if (!normalized) return "";
    const compact = normalized
      .replace(/^doc_custom_/, "")
      .replace(/^doc_/, "")
      .replace(/_+/g, " ")
      .trim();
    if (!compact) return "";
    return compact.replace(/\b[a-z]/g, function (char) { return char.toUpperCase(); });
  }

  function isBuiltInDocumentField(field) {
    return DOC_FIELDS.indexOf(trim(field)) !== -1;
  }

  function cloneJson(value) {
    try {
      return JSON.parse(JSON.stringify(value || null));
    } catch (_) {
      return value;
    }
  }

  function normalizeDocumentDefinition(input, tenant, orderIndex) {
    const source = input && typeof input === "object" ? input : {};
    const field = normalizeDocumentFieldKey(source.field || source.key || source.id || source.name);
    if (!field || !/^doc_[a-z0-9_]{1,76}$/.test(field)) return null;
    const builtIn = isBuiltInDocumentField(field);
    const label = sanitizeText(source.label || source.nombre || DOC_LABELS[field] || humanizeDocumentFieldLabel(field), 120);
    const dateField = trim(source.dateField || source.date_field);
    const requiresDate = source.requiresDate === true || source.requires_date === true || source.pideFecha === true || source.pide_fecha === true;
    const validityMode = trim(source.validityMode || source.validity_mode).toLowerCase();
    const requiredForProfile = source.requiredForProfile !== false && source.required_for_profile !== false && source.profile !== false;
    const requiredForContract = source.requiredForContract !== false && source.required_for_contract !== false && source.contract !== false;
    const allowOmit = field === "doc_constancia_fiscal" ? false : source.allowOmit !== false && source.allow_omit !== false;
    return {
      field,
      key: field,
      label: label || field,
      description: sanitizeText(source.description || source.desc || "", 240),
      icon: sanitizeText(source.icon || "fa-file-lines", 50),
      requiredForProfile,
      requiredForContract,
      requiresDate,
      dateField: builtIn ? dateField : "",
      validityMode,
      validityDays: Math.max(0, Number(source.validityDays || source.validity_days || 0) || 0),
      validityMonths: Math.max(0, Number(source.validityMonths || source.validity_months || 0) || 0),
      allowOmit,
      builtIn,
      custom: !builtIn,
      uploadField: builtIn ? field : CUSTOM_DOC_UPLOAD_PREFIX + field,
      accept: sanitizeText(source.accept || ".pdf,.jpg,.jpeg,.png,.webp", 120),
      requirements: safeArray(source.requirements || source.requisitos).map(function (line) {
        return sanitizeText(line, 180);
      }).filter(Boolean).slice(0, 8),
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : orderIndex
    };
  }

  function mergeDocumentDefinitions(defaults, configured, tenant) {
    const byField = {};
    const order = [];
    function upsert(def, index) {
      const normalized = normalizeDocumentDefinition(def, tenant, index);
      if (!normalized) return;
      const existing = byField[normalized.field] || {};
      byField[normalized.field] = Object.assign({}, existing, normalized, {
        dateField: normalized.dateField || existing.dateField || "",
        validityMode: normalized.validityMode || existing.validityMode || "",
        validityDays: normalized.validityDays > 0 ? normalized.validityDays : (existing.validityDays || 0),
        validityMonths: normalized.validityMonths > 0 ? normalized.validityMonths : (existing.validityMonths || 0),
        builtIn: existing.builtIn === true || normalized.builtIn === true,
        custom: !(existing.builtIn === true || normalized.builtIn === true)
      });
      if (order.indexOf(normalized.field) === -1) order.push(normalized.field);
    }
    (defaults || []).forEach(upsert);
    (configured || []).forEach(function (item, idx) {
      if (item && item.enabled === false) return;
      upsert(item, (defaults || []).length + idx);
    });
    return order
      .map(function (field) { return byField[field]; })
      .filter(function (def) { return def && (def.requiredForProfile || def.requiredForContract); });
  }

  function getDocumentRequirementsConfig(tenant) {
    const safeTenant = normalizeTenant(tenant) || "plaza_mayor";
    try {
      const rows = $app.findRecordsByFilter(
        "configuracion",
        "tenant = '" + safeTenant + "' && clave = '" + CLIENT_DOCUMENT_REQUIREMENTS_CONFIG_KEY + "'",
        "-updated_at",
        1,
        0
      ) || [];
      const row = rows[0] || null;
      if (!row) return {};
      let exported = {};
      try {
        exported = row.withCustomData(true).publicExport() || {};
      } catch (_) {
        exported = {};
      }
      const rawConfigString = trim(row.getString ? row.getString("valor_json") : "");
      if (rawConfigString) return parseJsonObject(rawConfigString);
      const rawConfig = Object.prototype.hasOwnProperty.call(exported, "valor_json")
        ? exported.valor_json
        : row.get("valor_json");
      return parseJsonObject(rawConfig);
    } catch (_) {
      return {};
    }
  }

  function getDocumentDefinitionsForTenant(tenant) {
    const safeTenant = normalizeTenant(tenant) || "plaza_mayor";
    const defaults = cloneJson(DEFAULT_DOCUMENT_DEFINITIONS[safeTenant] || DEFAULT_DOCUMENT_DEFINITIONS.plaza_mayor) || [];
    const config = getDocumentRequirementsConfig(safeTenant);
    const configured = Array.isArray(config) ? config : safeArray(config.documents || config.requisitos || config.items);
    return mergeDocumentDefinitions(defaults, configured, safeTenant);
  }

  function getDocumentDefinitionByField(tenant, field) {
    const target = normalizeDocumentFieldKey(field);
    const defs = getDocumentDefinitionsForTenant(tenant);
    for (let i = 0; i < defs.length; i += 1) {
      if (defs[i].field === target) return defs[i];
    }
    return null;
  }

  function parseJsonObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      try {
        const rawObjectString = trim(String(value));
        if (rawObjectString && rawObjectString !== "[object Object]" && rawObjectString.charAt(0) === "{") {
          const parsedFromString = JSON.parse(rawObjectString);
          return parsedFromString && typeof parsedFromString === "object" && !Array.isArray(parsedFromString) ? parsedFromString : {};
        }
      } catch (_) { }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      try {
        const parsed = JSON.parse(JSON.stringify(value));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {
        return value;
      }
    }
    if (typeof value === "string") {
      const raw = value.trim();
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) { }
    }
    return {};
  }

  function getRecordId(record) {
    if (!record) return "";
    try {
      const id = record.get ? record.get("id") : "";
      if (id) return sanitizeId(id);
    } catch (_) { }
    try {
      const id = record.id || "";
      if (id) return sanitizeId(id);
    } catch (_) { }
    return "";
  }

  function resolveClientRecord(clientOrId) {
    if (clientOrId && typeof clientOrId === "object" && typeof clientOrId.get === "function") return clientOrId;
    const safeClientId = sanitizeId(clientOrId);
    if (!safeClientId) return null;
    try {
      return $app.findRecordById("clientes", safeClientId);
    } catch (_) {
      return null;
    }
  }

  function getClientDocumentValidityReferenceDate(record, field, stateInfo, validationDoc) {
    const state = stateInfo && typeof stateInfo === "object" ? stateInfo : {};
    const doc = validationDoc && typeof validationDoc === "object" ? validationDoc : {};
    const explicitDate = normalizeDate(state.fecha_documento)
      || normalizeDate(state.fecha)
      || normalizeDate(doc.fechaDocumento)
      || normalizeDate(doc.fecha_documento)
      || normalizeDate(doc.validityDate);
    if (field === "doc_constancia_fiscal") {
      return normalizeDate(record ? record.get("constancia_fiscal_emitida_el") : "")
        || explicitDate;
    }
    if (field === "doc_comprobante_domicilio") {
      return normalizeDate(record ? record.get("comprobante_domicilio_emitido_el") : "")
        || explicitDate;
    }
    return explicitDate;
  }

  function buildClientDictamenDocumentSnapshot(record) {
    if (!record) return [];
    const validation = parseJsonObject(record.get("expediente_validacion"));
    const validationDocs = parseJsonObject(validation.documents);
    const states = getRecordDocStateMap(record);
    const snapshot = [];
    const definitions = getDocumentDefinitionsForTenant(record.get("tenant"));
    for (let i = 0; i < definitions.length; i += 1) {
      const definition = definitions[i];
      const field = definition.field;
      const state = states[field] && typeof states[field] === "object" ? states[field] : {};
      const validationDoc = validationDocs[field] && typeof validationDocs[field] === "object" ? validationDocs[field] : {};
      const fileInfo = getClientDocumentFileInfo(record, definition, validationDoc);
      const uploaded = fileInfo.uploaded === true;
      const omitted = isDocStateOmitted(state) || validationDoc.omitido === true || validationDoc.omitted === true;
      let status = trim(validationDoc.estado || validationDoc.status || state.status);
      if (omitted) status = "omitido";
      else if (!uploaded) status = "pendiente";
      else if (!status) status = "pendiente";
      snapshot.push({
        field,
        label: definition.label || DOC_LABELS[field] || field,
        fileName: fileInfo.fileName || trim(validationDoc.fileName),
        uploaded,
        status,
        omitted,
        reason: trim(validationDoc.motivo || validationDoc.reason || state.motivo),
        validityDate: definition.requiresDate ? getClientDocumentDateValue(record, definition, state, validationDoc) : "",
        reviewedByName: trim(validationDoc.revisadoPorNombre || validationDoc.reviewedByName || state.revisado_por_nombre),
        reviewedAt: normalizeDate(validationDoc.revisadoAt || validationDoc.reviewedAt || state.revisado_at),
        updatedAt: trim(state.actualizado_at || validationDoc.actualizadoAt || validationDoc.updatedAt),
        updatedFromRejection: state.actualizado_desde_rechazo === true
          || validationDoc.actualizadoDesdeRechazo === true
          || validationDoc.updatedFromRejection === true
      });
    }
    return snapshot;
  }

  function normalizeDictamenSnapshot(snapshot) {
    const source = Array.isArray(snapshot) ? snapshot : [];
    return source.map(function (item) {
      const doc = item && typeof item === "object" ? item : {};
      const uploaded = doc.uploaded === true;
      const omitted = doc.omitted === true || doc.omitido === true;
      let status = trim(doc.status || doc.estado).toLowerCase();
      if (!status) status = uploaded ? "pendiente" : "pendiente";
      if (omitted) status = "omitido";
      return {
        field: trim(doc.field),
        fileName: trim(doc.fileName || doc.file_name),
        uploaded: uploaded,
        omitted: omitted,
        validityDate: normalizeDate(doc.validityDate || doc.validity_date)
      };
    }).sort(function (a, b) { return a.field.localeCompare(b.field); });
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort();
      return "{" + keys.map(function (key) { return JSON.stringify(key) + ":" + stableStringify(value[key]); }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function dictamenMatchesCurrentSnapshot(metadata, currentSnapshot) {
    if (!Array.isArray(currentSnapshot) || currentSnapshot.length === 0) return true;
    const stored = metadata && typeof metadata === "object" ? metadata.documentos_snapshot : null;
    if (!Array.isArray(stored) || stored.length === 0) return false;
    return stableStringify(normalizeDictamenSnapshot(stored)) === stableStringify(normalizeDictamenSnapshot(currentSnapshot));
  }

  function getDictamenSource(metadata) {
    const raw = trim(metadata && typeof metadata === "object" ? metadata.source : "").toLowerCase();
    if (raw === "manual_upload" || raw === "manual") return "manual_upload";
    if (raw === "control") return "control";
    return "generated";
  }

  function getDictamenApprovalStatus(metadata) {
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    const rawStatus = trim(meta.approval_status || meta.status).toLowerCase();
    const source = getDictamenSource(meta);
    if (meta.approved === true || rawStatus === "aprobado" || rawStatus === "auto_aprobado") return "aprobado";
    if (rawStatus === "rechazado" || meta.rejected === true) return "rechazado";
    if (source !== "manual_upload" && !rawStatus) return "aprobado";
    return "pendiente";
  }

  function buildDictamenHistoryEntry(record, metadata, stale) {
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    return {
      id: trim(record.get("id")),
      folio: trim(record.get("folio")),
      pdf: getRecordFileName(record, "pdf") || "",
      source: getDictamenSource(meta),
      status: getDictamenApprovalStatus(meta),
      stale: stale === true,
      createdAt: trim(record.get("created_at")) || trim(record.get("created")),
      updatedAt: trim(record.get("updated_at")) || trim(record.get("updated")),
      reviewedAt: trim(meta.reviewed_at),
      approvedAt: trim(meta.approved_at),
      reviewedByName: trim(meta.reviewed_by && meta.reviewed_by.name),
      approvedByName: trim(meta.approved_by && meta.approved_by.name),
      reason: trim(meta.reason),
      documentosHash: trim(record.get("documentos_hash")) || trim(meta.documentos_hash)
    };
  }

  function getDictamenRecordSortTimestamp(record, metadata) {
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    const candidates = [
      trim(meta.generated_at),
      trim(meta.approved_at),
      trim(meta.reviewed_at),
      trim(record ? record.get("created_at") : ""),
      trim(record ? record.get("updated_at") : ""),
      trim(record ? record.get("created") : ""),
      trim(record ? record.get("updated") : "")
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const parsed = Date.parse(candidates[i]);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  }

  function getClientDictamenStatus(clientOrId, tenant) {
    const clientRecord = resolveClientRecord(clientOrId);
    const safeClientId = getRecordId(clientRecord) || sanitizeId(clientOrId);
    const safeTenant = normalizeTenant(tenant);
    const currentSnapshot = clientRecord ? buildClientDictamenDocumentSnapshot(clientRecord) : [];
    const summary = {
      saved: false,
      approved: false,
      pending: false,
      rejected: false,
      stale: false,
      total: 0,
      latestId: "",
      latestFolio: "",
      latestStatus: "",
      latestSource: "",
      latestPdf: "",
      latestCreatedAt: "",
      latestUpdatedAt: "",
      latestReviewedAt: "",
      latestApprovedAt: "",
      currentId: "",
      currentFolio: "",
      currentStatus: "",
      currentSource: "",
      currentPdf: "",
      currentCreatedAt: "",
      currentUpdatedAt: "",
      currentReviewedAt: "",
      currentApprovedAt: "",
      history: [],
      latestMeta: {}
    };
    if (!safeClientId || !safeTenant) return summary;
    try {
      const records = $app.findRecordsByFilter(
        "clientes_dictamenes",
        "cliente = '" + safeClientId + "' && tenant = '" + safeTenant + "'",
        "",
        200,
        0
      ) || [];
      const ordered = [];
      for (let i = 0; i < records.length; i += 1) {
        const record = records[i];
        if (!hasValue(record.get("pdf"))) continue;
        const metadata = parseJsonObject(record.get("metadata"));
        ordered.push({
          record,
          metadata,
          sortTs: getDictamenRecordSortTimestamp(record, metadata)
        });
      }
      ordered.sort(function (a, b) {
        return (b.sortTs || 0) - (a.sortTs || 0);
      });
      for (let i = 0; i < ordered.length; i += 1) {
        const row = ordered[i];
        const record = row.record;
        const metadata = row.metadata;
        const stale = !dictamenMatchesCurrentSnapshot(metadata, currentSnapshot);
        const entry = buildDictamenHistoryEntry(record, metadata, stale);
        summary.total += 1;
        if (!summary.latestId) {
          summary.latestId = entry.id;
          summary.latestFolio = entry.folio;
          summary.latestStatus = entry.status;
          summary.latestSource = entry.source;
          summary.latestPdf = entry.pdf;
          summary.latestCreatedAt = entry.createdAt;
          summary.latestUpdatedAt = entry.updatedAt;
          summary.latestReviewedAt = entry.reviewedAt;
          summary.latestApprovedAt = entry.approvedAt;
          summary.latestMeta = metadata;
        }
        if (summary.history.length < 25) summary.history.push(entry);
        if (stale) summary.stale = true;
        if (!summary.currentId) {
          summary.currentId = entry.id;
          summary.currentFolio = entry.folio;
          summary.currentStatus = entry.status;
          summary.currentSource = entry.source;
          summary.currentPdf = entry.pdf;
          summary.currentCreatedAt = entry.createdAt;
          summary.currentUpdatedAt = entry.updatedAt;
          summary.currentReviewedAt = entry.reviewedAt;
          summary.currentApprovedAt = entry.approvedAt;
        }
        const approved = entry.status === "aprobado";
        const rejected = entry.status === "rechazado";
        summary.saved = true;
        if (approved) summary.approved = true;
        else if (rejected) summary.rejected = true;
        else summary.pending = true;
      }
    } catch (_) { }
    return summary;
  }

  function clientHasSavedDictamen(clientId, tenant) {
    return getClientDictamenStatus(clientId, tenant).saved === true;
  }

  function clientHasApprovedDictamen(clientId, tenant) {
    return getClientDictamenStatus(clientId, tenant).approved === true;
  }

  function safeArray(value) {
    if (Array.isArray(value)) {
      try {
        if (typeof toString === "function") {
          const rawNativeArrayString = trim(toString(value));
          if (rawNativeArrayString && rawNativeArrayString.charAt(0) === "[") {
            const parsedNativeArray = JSON.parse(rawNativeArrayString);
            if (Array.isArray(parsedNativeArray)) return parsedNativeArray;
          }
        }
      } catch (_) { }
      return value;
    }
    if (value && typeof value === "object") {
      try {
        if (typeof toString === "function") {
          const rawNativeString = trim(toString(value));
          if (rawNativeString && rawNativeString !== "[object Object]") {
            try {
              const parsedNative = JSON.parse(rawNativeString);
              if (Array.isArray(parsedNative)) return parsedNative;
              if (parsedNative && typeof parsedNative === "object") {
                if (Array.isArray(parsedNative.items)) return parsedNative.items;
                if (Array.isArray(parsedNative.documents)) return parsedNative.documents;
              }
            } catch (_) {
              return rawNativeString.split(/[\n,;]+/);
            }
          }
        }
      } catch (_) { }
      try {
        const rawObjectString = trim(String(value));
        if (rawObjectString && rawObjectString !== "[object Object]") {
          const parsedFromString = JSON.parse(rawObjectString);
          if (Array.isArray(parsedFromString)) return parsedFromString;
          if (parsedFromString && typeof parsedFromString === "object") {
            if (Array.isArray(parsedFromString.items)) return parsedFromString.items;
            if (Array.isArray(parsedFromString.documents)) return parsedFromString.documents;
          }
        }
      } catch (_) { }
      try {
        if (typeof value.length === "number" && value.length >= 0) {
          const direct = [];
          for (let i = 0; i < value.length; i += 1) direct.push(value[i]);
          return direct;
        }
      } catch (_) { }
      try {
        const cloned = JSON.parse(JSON.stringify(value));
        if (Array.isArray(cloned)) return cloned;
        if (cloned && typeof cloned === "object") {
          if (Array.isArray(cloned.items)) return cloned.items;
          const numericKeys = Object.keys(cloned).filter(function (key) { return /^\d+$/.test(key); });
          if (numericKeys.length) {
            return numericKeys
              .sort(function (a, b) { return Number(a) - Number(b); })
              .map(function (key) { return cloned[key]; });
          }
        }
      } catch (_) { }
      try {
        return Array.from(value);
      } catch (_) { }
    }
    if (typeof value === "string") {
      const raw = value.trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : raw.split(/[\n,;]+/);
      } catch (_) {
        return raw.split(/[\n,;]+/);
      }
    }
    return [];
  }

  function buildContractEligibilityMetadata(options) {
    const opts = options && typeof options === "object" ? options : {};
    const enabled = opts.readyForContracts === true;
    const tag = enabled ? CONTRACT_GENERATION_TAG : "";
    const label = enabled ? CONTRACT_GENERATION_LABEL : "";
    const tags = tag ? [tag] : [];
    const labels = label ? [label] : [];
    return {
      canGenerateContract: enabled,
      canGenerateContracts: enabled,
      canGenerateContractTag: tag,
      canGenerateContractLabel: label,
      contractTag: tag,
      contractLabel: label,
      contractTags: tags,
      contractLabels: labels,
      etiquetasContrato: tags,
      etiquetas_contrato: tags
    };
  }

  function sanitizePhones(value) {
    const source = safeArray(value);
    const seen = {};
    const out = [];
    for (let i = 0; i < source.length; i += 1) {
      const phone = normalizePhone(source[i]);
      if (!phone || seen[phone]) continue;
      seen[phone] = true;
      out.push(phone);
      if (out.length >= 5) break;
    }
    return out;
  }

  function sanitizeEmails(value) {
    const source = safeArray(value);
    const seen = {};
    const out = [];
    for (let i = 0; i < source.length; i += 1) {
      const email = normalizeEmail(source[i]);
      if (!email || seen[email]) continue;
      seen[email] = true;
      out.push(email);
      if (out.length >= 5) break;
    }
    return out;
  }

  function uniqueStringList(items) {
    const source = Array.isArray(items) ? items : [];
    const seen = {};
    const out = [];
    for (let i = 0; i < source.length; i += 1) {
      const value = trim(source[i]);
      if (!value || seen[value]) continue;
      seen[value] = true;
      out.push(value);
    }
    return out;
  }

  function toPocketBaseDateTime(value) {
    const normalized = normalizeDate(value);
    return normalized ? normalized + " 00:00:00.000Z" : null;
  }

  function hasValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    if (value && typeof value === "object") return true;
    return trim(value) !== "";
  }

  function randomToken() {
    try {
      const generated = $security.randomString(48);
      if (generated) return String(generated);
    } catch (_) { }
    let token = "";
    while (token.length < 48) {
      token += Math.random().toString(36).slice(2);
    }
    return token.slice(0, 48);
  }

  function getUploadQuarantineRoot() {
    const dataDir = String($app.dataDir ? $app.dataDir() : "pb_data").replace(/\\/g, "/").replace(/\/+$/, "");
    return $filepath.join(dataDir, UPLOAD_QUARANTINE_DIR_NAME);
  }

  function getDefenderCliCandidates() {
    return uniqueStringList([
      trim($os.getenv(WINDOWS_DEFENDER_CLI_ENV)),
      "C:\\Program Files\\Windows Defender\\MpCmdRun.exe",
      "C:/Program Files/Windows Defender/MpCmdRun.exe",
      "MpCmdRun.exe"
    ]);
  }

  function runDefenderScanCommand(targetPath) {
    const candidates = uniqueStringList([defenderCliPathCache].concat(getDefenderCliCandidates()));
    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate) continue;
      try {
        const cmd = $os.cmd(candidate, "-Scan", "-ScanType", "3", "-File", targetPath);
        const output = toString(cmd.combinedOutput() || "");
        if (!trim(output)) continue;
        defenderCliPathCache = candidate;
        return output;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("Windows Defender scan did not return output.");
  }

  function isCleanDefenderOutput(output) {
    const text = String(output || "");
    return /found no threats|found\s+0\s+threat|no threats found|no se encontraron amenazas/i.test(text);
  }

  function isBlockedDefenderOutput(output) {
    const text = String(output || "");
    return /found\s+[1-9]\d*\s+threat|se encontraron\s+[1-9]\d*\s+amenaza/i.test(text);
  }

  // Ejecuta la validacion en cuarentena antes de permitir que un archivo entre al expediente.
  function scanBytesInQuarantine(bytes, originalName, label) {
    const safeLabel = label || "Documento";
    const safeName = sanitizeUploadName(originalName || "documento.bin") || "documento.bin";
    if (!bytes || !bytes.length) {
      throw new BadRequestError("El archivo de " + safeLabel + " esta vacio.");
    }

    const quarantineDir = $filepath.join(
      getUploadQuarantineRoot(),
      new Date().toISOString().slice(0, 10),
      randomToken().slice(0, 12)
    );
    const quarantinePath = $filepath.join(quarantineDir, safeName);

    try {
      $os.mkdirAll(quarantineDir, 448);
      $os.writeFile(quarantinePath, bytes, 384);
      const output = runDefenderScanCommand(quarantinePath);
      if (isCleanDefenderOutput(output)) {
        return { ok: true, output: output };
      }
      if (isBlockedDefenderOutput(output)) {
        console.log("[client_profile] Blocked upload after Defender scan:", safeName, output);
        throw new BadRequestError("El archivo de " + safeLabel + " no paso la seguridad del sistema. Intenta de nuevo con otro archivo.");
      }
      console.log("[client_profile] Unexpected Defender response:", safeName, output);
      throw new BadRequestError("No se pudo validar la seguridad del archivo de " + safeLabel + ".");
    } catch (scanErr) {
      if (scanErr && scanErr.name === "BadRequestError") throw scanErr;
      console.log("[client_profile] Defender scan failed:", safeName, String(scanErr));
      throw new BadRequestError("No se pudo validar la seguridad del archivo de " + safeLabel + ".");
    } finally {
      try { $os.removeAll(quarantineDir); } catch (_) { }
    }
  }

  function scanUploadedFileInQuarantine(field, file, definition, validationInfo) {
    const def = definition && typeof definition === "object" ? definition : {};
    const label = def.label || DOC_LABELS[field] || "Documento";
    const safeValidation = validationInfo && typeof validationInfo === "object" ? validationInfo : {};
    const bytes = toBytes(file);
    return scanBytesInQuarantine(
      bytes,
      safeValidation.originalName || file.originalName || file.name || label,
      label
    );
  }

  function currentUtcDay() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  function parseUtcDate(dateString) {
    const normalized = normalizeDate(dateString);
    if (!normalized) return null;
    const value = new Date(normalized + "T00:00:00Z");
    return isNaN(value.getTime()) ? null : value;
  }

  function formatUtcDate(dateValue) {
    if (!dateValue || isNaN(dateValue.getTime())) return "";
    return dateValue.toISOString().slice(0, 10);
  }

  function evaluateDocumentDate(dateString, maxAgeDays, referenceDay) {
    const target = parseUtcDate(dateString);
    const reference = referenceDay instanceof Date && !isNaN(referenceDay.getTime()) ? referenceDay : currentUtcDay();
    const safeMaxAgeDays = Math.max(0, Number(maxAgeDays) || 0);
    const threshold = new Date(reference.getTime() - (safeMaxAgeDays * 86400000));
    if (!target) {
      return {
        valid: false,
        reason: "missing",
        thresholdDate: formatUtcDate(threshold),
        ageDays: null
      };
    }
    const ageDays = Math.floor((reference.getTime() - target.getTime()) / 86400000);
    if (target.getTime() > reference.getTime()) {
      return {
        valid: false,
        reason: "future",
        thresholdDate: formatUtcDate(threshold),
        ageDays
      };
    }
    if (target.getTime() < threshold.getTime()) {
      return {
        valid: false,
        reason: "older_than_limit",
        thresholdDate: formatUtcDate(threshold),
        ageDays
      };
    }
    return {
      valid: true,
      reason: "ok",
      thresholdDate: formatUtcDate(threshold),
      ageDays
    };
  }

  function evaluateDocumentCalendarMonths(dateString, validMonths, referenceDay) {
    const target = parseUtcDate(dateString);
    const reference = referenceDay instanceof Date && !isNaN(referenceDay.getTime()) ? referenceDay : currentUtcDay();
    const safeMonths = Math.max(1, Number(validMonths) || 1);
    const thresholdMonthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - (safeMonths - 1), 1));
    if (!target) {
      return {
        valid: false,
        reason: "missing",
        thresholdDate: formatUtcDate(thresholdMonthStart),
        ageDays: null,
        validUntil: "",
        expiresAt: ""
      };
    }
    const ageDays = Math.floor((reference.getTime() - target.getTime()) / 86400000);
    const expiryBoundary = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + safeMonths, 1));
    const lastValidDay = new Date(expiryBoundary.getTime() - 86400000);
    if (target.getTime() > reference.getTime()) {
      return {
        valid: false,
        reason: "future",
        thresholdDate: formatUtcDate(thresholdMonthStart),
        ageDays,
        validUntil: formatUtcDate(lastValidDay),
        expiresAt: formatUtcDate(expiryBoundary)
      };
    }
    if (reference.getTime() >= expiryBoundary.getTime()) {
      return {
        valid: false,
        reason: "older_than_calendar_month_limit",
        thresholdDate: formatUtcDate(thresholdMonthStart),
        ageDays,
        validUntil: formatUtcDate(lastValidDay),
        expiresAt: formatUtcDate(expiryBoundary)
      };
    }
    return {
      valid: true,
      reason: "ok",
      thresholdDate: formatUtcDate(thresholdMonthStart),
      ageDays,
      validUntil: formatUtcDate(lastValidDay),
      expiresAt: formatUtcDate(expiryBoundary)
    };
  }

  function getRecordLifecycleDate(record, stateInfo) {
    const state = stateInfo && typeof stateInfo === "object" ? stateInfo : {};
    return normalizeDate(state.subido_at)
      || normalizeDate(state.aprobado_at)
      || normalizeDate(state.revisado_at)
      || normalizeDate(record ? record.get("created_at") : "")
      || normalizeDate(record ? record.get("created") : "");
  }

  function codeAt(text, index) {
    return text && text.length > index ? text.charCodeAt(index) : -1;
  }

  function readFileHeader(file, maxBytes) {
    try {
      if (!file) return "";
      // Try to read raw bytes from the file for magic number detection
      if (file.reader && typeof file.reader.open === "function") {
        let reader = null;
        try {
          reader = file.reader.open();
          if (!reader) return "";
          if (typeof toString === "function") {
            var raw = toString(reader, maxBytes || 32);
            return raw ? raw.slice(0, maxBytes || 32) : "";
          }
          if (typeof reader.toString === "function") {
            var str = reader.toString();
            return str ? str.slice(0, maxBytes || 32) : "";
          }
        } catch (_) {
          return "";
        } finally {
          try { if (reader && typeof reader.close === "function") reader.close(); } catch (_) { }
        }
      }
      return "";
    } catch (_) {
      return "";
    }
  }

  function detectUploadedFileType(file) {
    const header = readFileHeader(file, 32);
    if (!header) return "";
    if (header.indexOf("%PDF-") === 0) return "application/pdf";
    if (codeAt(header, 0) === 0xff && codeAt(header, 1) === 0xd8 && codeAt(header, 2) === 0xff) {
      return "image/jpeg";
    }
    if (
      codeAt(header, 0) === 0x89 &&
      codeAt(header, 1) === 0x50 &&
      codeAt(header, 2) === 0x4e &&
      codeAt(header, 3) === 0x47 &&
      codeAt(header, 4) === 0x0d &&
      codeAt(header, 5) === 0x0a &&
      codeAt(header, 6) === 0x1a &&
      codeAt(header, 7) === 0x0a
    ) {
      return "image/png";
    }
    if (header.slice(0, 4) === "RIFF" && header.slice(8, 12) === "WEBP") {
      return "image/webp";
    }
    return "";
  }

  function sanitizeUploadName(name) {
    let safe = String(name || "").replace(/\\/g, "/");
    const segments = safe.split("/").filter(Boolean);
    safe = segments.length ? segments[segments.length - 1] : safe;
    safe = safe.replace(/[\x00-\x1F\x7F]/g, "").trim();
    return safe.slice(0, 180);
  }

  function fileExtension(name) {
    const safe = sanitizeUploadName(name).toLowerCase();
    const index = safe.lastIndexOf(".");
    if (index <= 0 || index === safe.length - 1) return "";
    return safe.slice(index);
  }

  function hasDangerousInnerExtension(name) {
    const parts = sanitizeUploadName(name).toLowerCase().split(".").filter(Boolean);
    if (parts.length <= 1) return false;
    for (let i = 1; i < parts.length - 1; i += 1) {
      if (DANGEROUS_FILE_EXTENSIONS["." + parts[i]]) return true;
    }
    return false;
  }

  function validateUploadedFile(field, file, definition) {
    const def = definition && typeof definition === "object" ? definition : {};
    const label = def.label || DOC_LABELS[field] || "Documento";
    if (!file) {
      throw new BadRequestError("No se encontro el archivo de " + label + ".");
    }

    const originalName = sanitizeUploadName(file.originalName || file.name);
    if (!originalName) {
      throw new BadRequestError("El archivo de " + label + " debe conservar un nombre valido.");
    }
    if (originalName.charAt(0) === ".") {
      throw new BadRequestError("El archivo de " + label + " no puede iniciar con punto.");
    }
    if (!/^[a-zA-Z0-9._()\- \u00C0-\u024F]+$/.test(originalName) || originalName.indexOf("..") !== -1) {
      throw new BadRequestError("El archivo de " + label + " contiene caracteres no permitidos.");
    }
    if (hasDangerousInnerExtension(originalName)) {
      throw new BadRequestError("El archivo de " + label + " contiene una extension no permitida.");
    }


    const extension = fileExtension(originalName);
    var detectedMime = detectUploadedFileType(file);
    const allowedExtensions = DOC_ALLOWED_EXTENSIONS[detectedMime] || [];

    if (!extension || !detectedMime || allowedExtensions.indexOf(extension) === -1) {
      throw new BadRequestError(
        "El archivo de " + label + " debe ser un PDF, JPG, PNG o WEBP valido y coincidir con su extension."
      );
    }
    if (def.custom === true && def.requiresDate === true && detectedMime !== "application/pdf") {
      throw new BadRequestError("El archivo de " + label + " debe ser un PDF para poder extraer la fecha automaticamente.");
    }

    const fileSize = Math.max(0, Number(file.size || 0) || 0);
    if (!fileSize) {
      throw new BadRequestError("El archivo de " + label + " esta vacio.");
    }
    if (fileSize > MAX_DOC_FILE_SIZE) {
      throw new BadRequestError("El archivo de " + label + " excede 15 MB.");
    }

    return {
      originalName,
      extension,
      detectedMime,
      size: fileSize
    };
  }

  function validateUploadedFilesForRequest(e, tenant) {
    const resolvedTenant = normalizeTenant(tenant || (e && e.record ? e.record.get("tenant") : ""));
    const cacheKey = resolvedTenant || "__default__";
    try {
      if (e && e.__validatedUploadedFilesCache && e.__validatedUploadedFilesCache[cacheKey]) {
        return e.__validatedUploadedFilesCache[cacheKey];
      }
    } catch (_) { }
    const uploaded = {};
    const definitions = getDocumentDefinitionsForTenant(resolvedTenant);
    for (let i = 0; i < definitions.length; i += 1) {
      const definition = definitions[i];
      const field = definition.field;
      const uploadField = definition.uploadField || field;
      let files = [];
      try {
        files = e.findUploadedFiles(uploadField) || [];
      } catch (_) {
        files = [];
      }
      if (files.length > 1) {
        throw new BadRequestError("Solo puedes subir un archivo por documento.");
      }
      if (files.length === 1) {
        const validationInfo = validateUploadedFile(field, files[0], definition);
        scanUploadedFileInQuarantine(field, files[0], definition, validationInfo);
        uploaded[field] = {
          file: files[0],
          definition,
          validation: validationInfo
        };
      }
    }
    try {
      if (e) {
        if (!e.__validatedUploadedFilesCache) e.__validatedUploadedFilesCache = {};
        e.__validatedUploadedFilesCache[cacheKey] = uploaded;
      }
    } catch (_) { }
    return uploaded;
  }

  function getRecordFileName(record, field) {
    const value = record.get(field);
    if (Array.isArray(value)) return trim(value[0]);
    if (value && typeof value === "object") {
      if (typeof value.originalName === "string") return trim(value.originalName);
      if (typeof value.name === "string") return trim(value.name);
    }
    return trim(value);
  }

  function getLatestClientDocumentRecord(tenant, clientId, field) {
    const safeTenant = normalizeTenant(tenant);
    const safeClientId = sanitizeId(clientId);
    const safeField = normalizeDocumentFieldKey(field);
    if (!safeTenant || !safeClientId || !safeField) return null;
    try {
      const rows = $app.findRecordsByFilter(
        "documentos",
        "tenant = '" + safeTenant + "' && cliente = '" + safeClientId + "' && documento_campo = '" + safeField + "' && vigente = true",
        "-updated_at",
        1,
        0
      ) || [];
      if (rows[0]) return rows[0];
    } catch (_) { }
    try {
      const rows = $app.findRecordsByFilter(
        "documentos",
        "tenant = '" + safeTenant + "' && cliente = '" + safeClientId + "' && documento_campo = '" + safeField + "'",
        "-updated_at",
        1,
        0
      ) || [];
      return rows[0] || null;
    } catch (_) {
      return null;
    }
  }

  function getClientDocumentFileInfo(record, definition, validationDoc) {
    const def = definition && typeof definition === "object" ? definition : {};
    const field = trim(def.field);
    const validation = validationDoc && typeof validationDoc === "object" ? validationDoc : {};
    if (!record || !field) return { uploaded: false, fileName: "", recordId: "", collection: "" };
    if (def.builtIn !== false && isBuiltInDocumentField(field)) {
      const fileName = getRecordFileName(record, field) || trim(validation.fileName);
      return {
        uploaded: !!fileName || validation.uploaded === true,
        fileName,
        recordId: getRecordId(record),
        collection: "clientes"
      };
    }
    const docRecord = getLatestClientDocumentRecord(record.get("tenant"), getRecordId(record), field);
    const fileName = docRecord ? (getRecordFileName(docRecord, "archivo") || trim(docRecord.get("nombre_original"))) : trim(validation.fileName);
    return {
      uploaded: !!fileName || validation.uploaded === true,
      fileName,
      recordId: docRecord ? trim(docRecord.get("id")) : trim(validation.fileRecordId),
      collection: "documentos",
      ruta: docRecord ? trim(docRecord.get("ruta")) : trim(validation.ruta)
    };
  }

  function getClientDocumentDateValue(record, definition, stateInfo, validationDoc) {
    const def = definition && typeof definition === "object" ? definition : {};
    const state = stateInfo && typeof stateInfo === "object" ? stateInfo : {};
    const doc = validationDoc && typeof validationDoc === "object" ? validationDoc : {};
    if (def.field === "doc_constancia_fiscal" || def.field === "doc_comprobante_domicilio") {
      return getClientDocumentValidityReferenceDate(record, def.field, state, doc);
    }
    return normalizeDate(state.fecha_documento)
      || normalizeDate(state.fecha)
      || normalizeDate(doc.fechaDocumento)
      || normalizeDate(doc.fecha_documento)
      || normalizeDate(doc.validityDate);
  }

  function getRequiredDocFieldsForTenant(tenant) {
    return getDocumentDefinitionsForTenant(tenant)
      .filter(function (def) { return def.requiredForProfile === true; })
      .map(function (def) { return def.field; });
  }

  function canDocumentBeOmitted(field, tenant) {
    const definition = getDocumentDefinitionByField(tenant || "plaza_mayor", field);
    if (definition) return definition.allowOmit !== false;
    return trim(field) !== "doc_constancia_fiscal";
  }

  function isDocStateOmitted(state) {
    return !!(state && typeof state === "object" && (
      state.omitido === true ||
      trim(state.status).toLowerCase() === "omitido"
    ));
  }

  function isDocStateApproved(state) {
    return normalizeDocDecisionStatus(state) === "aprobado";
  }

  function isDocStateApprovedOrOmitted(state) {
    return isDocStateApproved(state) || isDocStateOmitted(state);
  }

  function normalizeDocStateMap(value) {
    if (!value) return {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      try {
        const parsed = JSON.parse(JSON.stringify(value));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {
        return value;
      }
    }
    if (typeof value === "string" && value.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) { }
    }
    return {};
  }

  function getRecordDocStateMap(record) {
    if (!record) return {};
    try {
      const fromString = normalizeDocStateMap(record.getString ? record.getString("documentos_estado") : "");
      if (Object.keys(fromString).length) return fromString;
    } catch (_) { }
    try {
      return normalizeDocStateMap(record.get ? record.get("documentos_estado") : {});
    } catch (_) {
      return {};
    }
  }

  function normalizeDocDecisionStatus(state) {
    return trim(state && typeof state === "object" ? state.status : "").toLowerCase();
  }

  function normalizeDocDecisionReason(state) {
    return trim(state && typeof state === "object" ? state.motivo : "");
  }

  function normalizeDocDecisionOmitted(state) {
    return !!(state && typeof state === "object" && (
      state.omitido === true ||
      normalizeDocDecisionStatus(state) === "omitido"
    ));
  }

  function authRole(record) {
    return trim(record?.getString ? record.getString("role") : "").toLowerCase();
  }

  function isVerifierRole(role) {
    return role === "admin" || role === "verificador";
  }

  function canVerifyClientDocuments(authRecord) {
    return !!authRecord && isVerifierRole(authRole(authRecord));
  }

  function buildAuthActorMeta(authRecord) {
    if (!authRecord) return { id: "", name: "" };
    const email = trim(authRecord.getString ? authRecord.getString("email") : "");
    const loginUsername = trim(authRecord.getString ? authRecord.getString("login_username") : "");
    const username = trim(authRecord.getString ? authRecord.getString("username") : "");
    return {
      id: trim(authRecord.get ? authRecord.get("id") : ""),
      name: loginUsername || username || (email ? email.split("@")[0] : "") || "Verificador"
    };
  }

  function buildValidation(record) {
    const tenant = normalizeTenant(record.get("tenant"));
    const documentDefinitions = getDocumentDefinitionsForTenant(tenant);
    const profileDefinitions = documentDefinitions.filter(function (def) { return def.requiredForProfile === true; });
    const contractDefinitions = documentDefinitions.filter(function (def) { return def.requiredForContract === true; });
    const additionalPhones = sanitizePhones(record.get("telefonos_adicionales"));
    const mainPhone = normalizePhone(record.get("telefono"));
    const docEstados = getRecordDocStateMap(record);
    const constanciaState = docEstados.doc_constancia_fiscal && typeof docEstados.doc_constancia_fiscal === "object"
      ? docEstados.doc_constancia_fiscal
      : {};
    const comprobanteState = docEstados.doc_comprobante_domicilio && typeof docEstados.doc_comprobante_domicilio === "object"
      ? docEstados.doc_comprobante_domicilio
      : {};
    const constanciaDate = normalizeDate(record.get("constancia_fiscal_emitida_el"));
    const comprobanteDate = normalizeDate(record.get("comprobante_domicilio_emitido_el"));
    const constanciaUploadDate = normalizeDate(constanciaState.subido_at) || normalizeDate(constanciaState.aprobado_at) || normalizeDate(constanciaState.revisado_at);
    const comprobanteUploadDate = normalizeDate(comprobanteState.subido_at) || normalizeDate(comprobanteState.aprobado_at) || normalizeDate(comprobanteState.revisado_at);
    const constanciaInfo = evaluateDocumentDate(constanciaDate, MAX_CONSTANCIA_VALID_DAYS);
    const comprobanteInfo = evaluateDocumentCalendarMonths(comprobanteDate, MAX_COMPROBANTE_VALID_MONTHS);
    const missingFields = [];
    const missingDocuments = [];
    const contractMissingFields = [];
    const contractMissingDocuments = [];
    const documents = {};

    if (!trim(record.get("nombre_completo"))) missingFields.push("nombre_completo");
    if (!trim(record.get("correo"))) missingFields.push("correo");
    if (!trim(record.get("rfc"))) missingFields.push("rfc");
    if (!mainPhone && additionalPhones.length === 0) missingFields.push("telefono");

    const constanciaOmitted = canDocumentBeOmitted("doc_constancia_fiscal", tenant) && isDocStateOmitted(docEstados.doc_constancia_fiscal);
    const comprobanteOmitted = canDocumentBeOmitted("doc_comprobante_domicilio", tenant) && isDocStateOmitted(docEstados.doc_comprobante_domicilio);
    let profileDocsApproved = true;
    let contractDocsApproved = true;
    let profileDocRejected = false;
    let contractDocRejected = false;
    let someDocPending = false;

    function evaluateConfiguredDate(def, dateValue, omitted) {
      if (!def.requiresDate || omitted) return { valid: true, reason: "not_required" };
      const normalized = normalizeDate(dateValue);
      if (!normalized) return { valid: false, reason: "missing" };
      if (def.field === "doc_constancia_fiscal") return constanciaInfo;
      if (def.field === "doc_comprobante_domicilio") return comprobanteInfo;
      const futureCheck = evaluateDocumentDate(normalized, 3650);
      if (futureCheck.reason === "future") return futureCheck;
      if (def.validityMode === "calendar_months" || def.validityMonths > 0) {
        return evaluateDocumentCalendarMonths(normalized, def.validityMonths || MAX_COMPROBANTE_VALID_MONTHS);
      }
      if (def.validityDays > 0) return evaluateDocumentDate(normalized, def.validityDays);
      return { valid: true, reason: "ok", ageDays: futureCheck.ageDays, thresholdDate: futureCheck.thresholdDate || "" };
    }

    for (let i = 0; i < documentDefinitions.length; i += 1) {
      const definition = documentDefinitions[i];
      const field = definition.field;
      const stateInfo = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
      const omitted = canDocumentBeOmitted(field, tenant) && isDocStateOmitted(stateInfo);
      const validationDoc = {};
      const fileInfo = getClientDocumentFileInfo(record, definition, validationDoc);
      const uploaded = fileInfo.uploaded === true;
      const fileName = fileInfo.fileName || "";
      const documentDate = getClientDocumentDateValue(record, definition, stateInfo, validationDoc);
      const dateInfo = evaluateConfiguredDate(definition, documentDate, omitted);

      let dStat = stateInfo.status ? stateInfo.status : "pendiente";
      let dReason = stateInfo.motivo ? stateInfo.motivo : "";

      if (omitted) {
        dStat = "omitido";
        dReason = "";
      } else if (!uploaded) {
        dStat = "pendiente";
        dReason = "";
      } else {
        if (dStat === "rechazado") {
          if (definition.requiredForProfile) profileDocRejected = true;
          if (definition.requiredForContract) contractDocRejected = true;
        } else if (dStat === "pendiente" && definition.requiredForProfile) {
          someDocPending = true;
        }
      }
      const docReady = uploaded && dStat === "aprobado" && dateInfo.valid !== false;
      const covered = omitted || docReady;
      if (definition.requiredForProfile && !covered) profileDocsApproved = false;
      if (definition.requiredForContract && !covered) contractDocsApproved = false;

      documents[field] = {
        field,
        key: field,
        label: definition.label || DOC_LABELS[field] || field,
        description: definition.description || "",
        icon: definition.icon || "",
        requiredForProfile: definition.requiredForProfile === true,
        requiredForContract: definition.requiredForContract === true,
        requiresDate: definition.requiresDate === true,
        allowOmit: definition.allowOmit !== false,
        builtIn: definition.builtIn === true,
        custom: definition.custom === true,
        uploadField: definition.uploadField || field,
        uploaded,
        fileName: fileName || "",
        fileRecordId: fileInfo.recordId || "",
        fileCollection: fileInfo.collection || (definition.builtIn ? "clientes" : "documentos"),
        ruta: fileInfo.ruta || "",
        estado: dStat,
        motivo: dReason,
        omitido: omitted,
        fechaDocumento: documentDate || "",
        dateValid: dateInfo.valid !== false,
        dateReason: dateInfo.reason || "",
        subidoAt: trim(stateInfo.subido_at),
        actualizadoAt: trim(stateInfo.actualizado_at),
        actualizadoDesdeRechazo: stateInfo.actualizado_desde_rechazo === true,
        revisadoPorId: trim(stateInfo.revisado_por_id),
        revisadoPorNombre: trim(stateInfo.revisado_por_nombre),
        revisadoAt: trim(stateInfo.revisado_at),
        aprobadoPorId: trim(stateInfo.aprobado_por_id),
        aprobadoPorNombre: trim(stateInfo.aprobado_por_nombre),
        aprobadoAt: trim(stateInfo.aprobado_at)
      };
      const hasDedicatedDateField = field === "doc_constancia_fiscal" || field === "doc_comprobante_domicilio";
      if (definition.requiredForProfile) {
        if (!uploaded && !omitted) missingDocuments.push(field);
        if (definition.requiresDate && !omitted && !documentDate && !hasDedicatedDateField) missingFields.push(field + "_fecha_documento");
      }
      if (definition.requiredForContract) {
        if (!uploaded && !omitted) contractMissingDocuments.push(field);
        if (definition.requiresDate && !omitted && !documentDate && !hasDedicatedDateField) contractMissingFields.push(field + "_fecha_documento");
        if (uploaded && dStat !== "aprobado" && !omitted) contractMissingFields.push(field + "_aprobado");
      }
    }

    if (!constanciaOmitted && !constanciaDate) {
      missingFields.push("constancia_fiscal_emitida_el");
      contractMissingFields.push("constancia_fiscal_emitida_el");
    }
    if (!comprobanteOmitted && !comprobanteDate) {
      missingFields.push("comprobante_domicilio_emitido_el");
      contractMissingFields.push("comprobante_domicilio_emitido_el");
    }

    const uniqueMissingFields = uniqueStringList(missingFields);
    const uniqueMissingDocuments = uniqueStringList(missingDocuments);
    const uniqueContractMissingFields = uniqueStringList(contractMissingFields);
    const uniqueContractMissingDocuments = uniqueStringList(contractMissingDocuments);
    const complete = uniqueMissingFields.length === 0 && uniqueMissingDocuments.length === 0;
    const constanciaValid = constanciaOmitted ? true : constanciaInfo.valid;
    const comprobanteValid = comprobanteOmitted ? true : comprobanteInfo.valid;
    const ready = complete && constanciaValid && comprobanteValid && profileDocsApproved && !profileDocRejected;
    const dictamenStatus = getClientDictamenStatus(record, tenant);
    const dictamenGuardado = dictamenStatus.saved === true;
    const dictamenAprobado = dictamenStatus.approved === true;
    const contractDocsReady = uniqueContractMissingDocuments.length === 0 && uniqueContractMissingFields.length === 0 && contractDocsApproved && !contractDocRejected;
    const readyForContracts = ready && contractDocsReady && (dictamenAprobado || dictamenGuardado);
    const contractEligibility = buildContractEligibilityMetadata({ readyForContracts });
    const allContractMissingFields = readyForContracts ? [] : uniqueStringList(uniqueMissingFields.concat(uniqueContractMissingFields));
    if (ready && !(dictamenAprobado || dictamenGuardado)) contractMissingFields.push("dictamen_aprobado");

    let status = "pendiente_expediente";
    if (readyForContracts) {
      status = "listo_para_contrato";
    } else if (ready) {
      status = "validado";
    } else if (profileDocRejected) {
      status = "rechazado_parcial";
    } else if (complete && constanciaValid && comprobanteValid && someDocPending) {
      status = "pendiente_revision";
    } else if (complete && !constanciaValid && !comprobanteValid) {
      status = "documento_vencido";
    } else if (complete && !constanciaValid) {
      status = "constancia_vencida";
    } else if (complete && !comprobanteValid) {
      status = "comprobante_vencido";
    }

    return {
      status,
      ready,
      complete,
      data: {
        checkedAt: new Date().toISOString(),
        readyForQuotes: ready,
        readyForContracts,
        ...contractEligibility,
        isComplete: complete,
        dictamenGuardado,
        dictamenAprobado,
        dictamenPendiente: dictamenStatus.pending === true,
        dictamenDesactualizado: dictamenStatus.stale === true,
        dictamen: {
          saved: dictamenGuardado,
          approved: dictamenAprobado,
          pending: dictamenStatus.pending === true,
          rejected: dictamenStatus.rejected === true,
          stale: dictamenStatus.stale === true,
          total: dictamenStatus.total || 0,
          latestId: dictamenStatus.latestId || "",
          latestFolio: dictamenStatus.latestFolio || "",
          latestStatus: dictamenStatus.latestStatus || "",
          latestSource: dictamenStatus.latestSource || "",
          latestPdf: dictamenStatus.latestPdf || "",
          latestCreatedAt: dictamenStatus.latestCreatedAt || "",
          latestUpdatedAt: dictamenStatus.latestUpdatedAt || "",
          latestReviewedAt: dictamenStatus.latestReviewedAt || "",
          latestApprovedAt: dictamenStatus.latestApprovedAt || "",
          currentId: dictamenStatus.currentId || "",
          currentFolio: dictamenStatus.currentFolio || "",
          currentStatus: dictamenStatus.currentStatus || "",
          currentSource: dictamenStatus.currentSource || "",
          currentPdf: dictamenStatus.currentPdf || "",
          currentCreatedAt: dictamenStatus.currentCreatedAt || "",
          currentUpdatedAt: dictamenStatus.currentUpdatedAt || "",
          currentReviewedAt: dictamenStatus.currentReviewedAt || "",
          currentApprovedAt: dictamenStatus.currentApprovedAt || "",
          historial: Array.isArray(dictamenStatus.history) ? dictamenStatus.history : []
        },
        documentRequirements: documentDefinitions,
        contractMissingFields: readyForContracts ? [] : uniqueStringList(allContractMissingFields.concat(ready && !(dictamenAprobado || dictamenGuardado) ? ["dictamen_aprobado"] : [])),
        contractMissingDocuments: uniqueContractMissingDocuments,
        maxConstanciaAgeDays: MAX_CONSTANCIA_VALID_DAYS,
        maxComprobanteAgeDays: MAX_COMPROBANTE_VALID_DAYS,
        maxComprobanteAgeMonths: MAX_COMPROBANTE_VALID_MONTHS,
        constanciaFiscalEmitidaEl: constanciaDate || "",
        constanciaFiscalSubidaEl: constanciaUploadDate || "",
        constanciaFiscalVigente: constanciaValid,
        constanciaFiscalReason: constanciaOmitted ? "omitted" : constanciaInfo.reason,
        constanciaFiscalLimiteDesde: constanciaInfo.thresholdDate || "",
        constanciaFiscalDiasAntiguedad: constanciaInfo.ageDays,
        comprobanteDomicilioEmitidoEl: comprobanteDate || "",
        comprobanteDomicilioSubidoEl: comprobanteUploadDate || "",
        comprobanteDomicilioVigente: comprobanteValid,
        comprobanteDomicilioReason: comprobanteOmitted ? "omitted" : comprobanteInfo.reason,
        comprobanteDomicilioLimiteDesde: comprobanteInfo.thresholdDate || "",
        comprobanteDomicilioVigenteHasta: comprobanteInfo.validUntil || "",
        comprobanteDomicilioExpiraEl: comprobanteInfo.expiresAt || "",
        comprobanteDomicilioDiasAntiguedad: comprobanteInfo.ageDays,
        serverDate: formatUtcDate(currentUtcDay()),
        missingFields: uniqueMissingFields,
        missingDocuments: uniqueMissingDocuments,
        additionalPhoneCount: additionalPhones.length,
        documents
      }
    };
  }

  function applyValidationToRecord(record, options) {
    const opts = options && typeof options === "object" ? options : {};
    const existingToken = trim(record.get("perfil_publico_token"));
    if (!existingToken) record.set("perfil_publico_token", randomToken());
    record.set("telefonos_adicionales", sanitizePhones(record.get("telefonos_adicionales")));
    record.set("correos_adicionales", sanitizeEmails(record.get("correos_adicionales")));
    record.set("constancia_fiscal_emitida_el", normalizeDate(record.get("constancia_fiscal_emitida_el")));
    record.set(
      "comprobante_domicilio_emitido_el",
      toPocketBaseDateTime(record.get("comprobante_domicilio_emitido_el"))
    );
    const validation = buildValidation(record);
    record.set("perfil_estatus", validation.status);
    record.set("perfil_validado", validation.ready);
    record.set("perfil_completo", validation.complete);
    record.set("dictamen", validation.data && validation.data.dictamen ? validation.data.dictamen : {});
    record.set("expediente_validacion", validation.data);
    if (opts.touchPublicUpdateAt === true) {
      record.set("perfil_publico_actualizado_at", new Date().toISOString());
    }
    record.set(
      "expediente_validado_at",
      validation.ready ? (trim(record.get("expediente_validado_at")) || new Date().toISOString()) : ""
    );
    return validation;
  }

  function getTheme(tenant) {
    return TENANT_THEME[normalizeTenant(tenant)] || TENANT_THEME.plaza_mayor;
  }

  function buildPublicProfilePayload(record, validation, accessMeta) {
    const theme = getTheme(record.get("tenant"));
    const additionalPhones = sanitizePhones(record.get("telefonos_adicionales"));
    const additionalEmails = sanitizeEmails(record.get("correos_adicionales"));
    const meta = accessMeta && typeof accessMeta === "object" ? accessMeta : {};
    const publicValidation = Object.assign({}, validation.data, {
      status: validation.status,
      ready: validation.ready,
      complete: validation.complete
    });
    [
      "dictamen",
      "dictamenGuardado",
      "dictamenAprobado",
      "dictamenPendiente",
      "dictamenDesactualizado",
      "readyForContracts",
      "canGenerateContract",
      "canGenerateContracts",
      "canGenerateContractTag",
      "contractTag",
      "contractTags",
      "etiquetasContrato",
      "etiquetas_contrato",
      "contractMissingFields"
    ].forEach(function (field) {
      delete publicValidation[field];
    });
    return {
      id: trim(record.get("id")),
      tenant: trim(record.get("tenant")),
      nombreCompleto: trim(record.get("nombre_completo")),
      correo: trim(record.get("correo")),
      correosAdicionales: additionalEmails,
      telefono: normalizePhone(record.get("telefono")),
      rfc: trim(record.get("rfc")).toUpperCase(),
      verificadoManualmente: !!record.get("verificado_manualmente"),
      telefonosAdicionales: additionalPhones,
      constanciaFiscalEmitidaEl: normalizeDate(record.get("constancia_fiscal_emitida_el")),
      comprobanteDomicilioEmitidoEl: normalizeDate(record.get("comprobante_domicilio_emitido_el")),
      validation: publicValidation,
      quotes: buildPublicClientQuoteSummaries(record),
      profileStatus: validation.status,
      readyForQuotes: validation.ready,
      serverDate: validation.data.serverDate,
      accessExpiresAt: trim(meta.expiresAt),
      theme
    };
  }

  function publicQuoteBelongsToClient(quoteRecord, clientRecord) {
    if (!quoteRecord || !clientRecord) return false;
    const clientId = trim(clientRecord.get("id"));
    const clientEmail = normalizeEmail(clientRecord.get("correo"));
    const quoteClientId = trim(quoteRecord.get("cliente_id"));
    const quoteEmail = normalizeEmail(quoteRecord.get("cliente_email"));
    if (clientId && quoteClientId && clientId === quoteClientId) return true;
    if (clientEmail && quoteEmail && clientEmail === quoteEmail) return true;
    return false;
  }

  function buildPublicClientQuoteSummaries(clientRecord) {
    const tenant = normalizeTenant(clientRecord.get("tenant"));
    const clientId = sanitizeId(clientRecord.get("id"));
    const clientEmail = normalizeEmail(clientRecord.get("correo"));
    const merged = {};

    function append(records) {
      for (let i = 0; i < records.length; i += 1) {
        const row = records[i];
        const rowId = trim(row.get("id"));
        if (!rowId || merged[rowId]) continue;
        if (!publicQuoteBelongsToClient(row, clientRecord)) continue;
        merged[rowId] = row;
      }
    }

    try {
      if (tenant && clientId) {
        append($app.findRecordsByFilter(
          "cotizaciones",
          "tenant = '" + tenant + "' && cliente_id = '" + clientId + "'",
          "-created_at",
          100,
          0
        ) || []);
      }
      if (tenant && clientEmail) {
        append($app.findRecordsByFilter(
          "cotizaciones",
          "tenant = '" + tenant + "' && cliente_email = '" + clientEmail + "'",
          "-created_at",
          100,
          0
        ) || []);
      }
    } catch (_) { }

    return Object.keys(merged)
      .map(function (id) { return merged[id]; })
      .sort(function (a, b) {
        const aTs = Date.parse(trim(a.get("updated_at")) || trim(a.get("created_at")) || "") || 0;
        const bTs = Date.parse(trim(b.get("updated_at")) || trim(b.get("created_at")) || "") || 0;
        return bTs - aTs;
      })
      .map(function (row) {
        const payments = safeArray(row.get("historial_pagos")).filter(function (item) {
          const path = trim(item && (item.file_path || item.path || item.url));
          return !!path;
        });
        return {
          id: trim(row.get("id")),
          folio: trim(row.get("numero_orden")),
          nombre: trim(row.get("nombre_cotizacion")) || trim(row.get("espacio_nombre")) || "Cotizacion",
          espacioNombre: trim(row.get("espacio_nombre")),
          fechaInicio: normalizeDate(row.get("fecha_inicio")),
          fechaFin: normalizeDate(row.get("fecha_fin")),
          status: trim(row.get("status")).toLowerCase(),
          flujoEstado: normalizePublicQuoteFlow(row.get("flujo_estado")),
          precioFinal: Number(row.get("precio_final") || 0) || 0,
          numeroContrato: trim(row.get("numero_contrato")),
          documents: {
            cotizacion: !!(getRecordFileName(row, "cotizacion_final_file") || trim(row.get("url_cotizacion_final"))),
            contrato: !!(getRecordFileName(row, "contrato_file") || trim(row.get("contrato_url"))),
            facturaPdf: !!(getRecordFileName(row, "factura_pdf_file") || trim(row.get("factura_pdf_url"))),
            facturaXml: !!(getRecordFileName(row, "factura_xml_file") || trim(row.get("factura_xml_url"))),
            recibos: payments.length
          }
        };
      });
  }

  function normalizePublicQuoteFlow(value) {
    const raw = trim(value).toLowerCase();
    if (raw === "orden_compra" || raw === "orden") return "aprobada";
    return raw;
  }

  function normalizePublicAssetKind(value) {
    const raw = trim(value).toLowerCase();
    if (raw === "cotizacion" || raw === "cotizacion_final") return "cotizacion";
    if (raw === "contrato" || raw === "contract") return "contrato";
    if (raw === "factura_pdf" || raw === "factura") return "factura_pdf";
    if (raw === "factura_xml" || raw === "xml") return "factura_xml";
    if (raw === "recibo" || raw === "receipt") return "recibo";
    return "";
  }

  function guessMimeType(fileName) {
    const ext = fileExtension(fileName);
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".xml") return "application/xml";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    if (ext === ".html") return "text/html; charset=utf-8";
    if (ext === ".txt") return "text/plain; charset=utf-8";
    return "application/octet-stream";
  }

  function buildStorageFilePath(record, storedFileName) {
    if (!record) return "";
    const collection = typeof record.collection === "function" ? record.collection() : null;
    const collectionId = trim(collection && collection.id ? collection.id : "");
    const recordId = trim(record.get("id"));
    const fileName = sanitizeUploadName(storedFileName);
    if (!collectionId || !recordId || !fileName) return "";
    const dataDir = String($app.dataDir ? $app.dataDir() : "pb_data").replace(/\\/g, "/").replace(/\/+$/, "");
    return dataDir + "/storage/" + collectionId + "/" + recordId + "/" + fileName;
  }

  function readStoredRecordFile(record, field) {
    const storedFileName = sanitizeUploadName(getRecordFileName(record, field));
    const storagePath = buildStorageFilePath(record, storedFileName);
    if (!storedFileName || !storagePath) return null;
    try {
      return {
        bytes: toBytes($os.readFile(storagePath)),
        storedFileName,
        mime: guessMimeType(storedFileName)
      };
    } catch (_) {
      return null;
    }
  }

  function findDocumentoByPath(tenant, storedPath) {
    const safeTenant = normalizeTenant(tenant);
    const safePath = trim(storedPath);
    if (!safeTenant || !safePath) return null;
    try {
      const rows = $app.findRecordsByFilter(
        "documentos",
        "tenant = '" + safeTenant + "' && ruta = '" + safePath + "'",
        "-created_at",
        1,
        0
      ) || [];
      return rows[0] || null;
    } catch (_) {
      return null;
    }
  }

  function readStoredDocumentPath(tenant, storedPath, downloadName) {
    const docRecord = findDocumentoByPath(tenant, storedPath);
    if (!docRecord) return null;
    const stored = readStoredRecordFile(docRecord, "archivo");
    if (!stored) return null;
    return {
      bytes: stored.bytes,
      mime: stored.mime,
      fileName: sanitizeUploadName(downloadName || trim(docRecord.get("nombre_original")) || stored.storedFileName)
    };
  }

  function getCollectionByName(name) {
    try {
      return $app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function buildClientDocumentMirrorPath(tenant, clientId, field, fileName) {
    const safeTenant = normalizeTenant(tenant);
    const safeClientId = sanitizeId(clientId);
    const safeField = trim(field).replace(/[^a-zA-Z0-9_]/g, "");
    const safeFile = sanitizeUploadName(fileName);
    if (!safeTenant || !safeClientId || !safeField || !safeFile) return "";
    return `clientes/${safeTenant}/${safeClientId}/${safeField}/${safeFile}`;
  }

  function findClientDocumentMirrorRecords(tenant, clientId, field) {
    const safeTenant = normalizeTenant(tenant);
    const safeClientId = sanitizeId(clientId);
    const safeField = trim(field).replace(/[^a-zA-Z0-9_]/g, "");
    if (!safeTenant || !safeClientId || !safeField) return [];
    try {
      return $app.findRecordsByFilter(
        "documentos",
        "tenant = '" + safeTenant + "' && cliente = '" + safeClientId + "' && documento_campo = '" + safeField + "'",
        "-updated_at",
        100,
        0
      ) || [];
    } catch (_) {
      return [];
    }
  }

  function buildClientDocumentMirrorMetadata(record, field, stateInfo, validationDoc, fileName, options) {
    const state = stateInfo && typeof stateInfo === "object" ? stateInfo : {};
    const doc = validationDoc && typeof validationDoc === "object" ? validationDoc : {};
    const opts = options && typeof options === "object" ? options : {};
    const emittedAt = field === "doc_constancia_fiscal"
      ? normalizeDate(record.get("constancia_fiscal_emitida_el"))
      : (field === "doc_comprobante_domicilio"
        ? normalizeDate(record.get("comprobante_domicilio_emitido_el"))
        : "");
    const omitted = isDocStateOmitted(state);
    const status = trim(doc.estado || doc.status || state.status || (omitted ? "omitido" : "pendiente")).toLowerCase();
    const vigente = opts.vigente !== false;
    return {
      source: "cliente_expediente",
      tenant: normalizeTenant(record.get("tenant")),
      cliente_id: getRecordId(record),
      cliente_nombre: trim(record.get("nombre_completo")),
      documento_campo: trim(field),
      documento_nombre: DOC_LABELS[field] || trim(field),
      estado: status || "pendiente",
      omitido: omitted,
      vigente,
      historico: vigente !== true,
      file_name: sanitizeUploadName(fileName),
      emitted_at: emittedAt,
      reviewed_by_id: trim(state.revisado_por_id),
      reviewed_by_name: trim(state.revisado_por_nombre),
      reviewed_at: trim(state.revisado_at),
      approved_by_id: trim(state.aprobado_por_id),
      approved_by_name: trim(state.aprobado_por_nombre),
      approved_at: trim(state.aprobado_at),
      updated_at: trim(state.actualizado_at),
      updated_from_rejection: state.actualizado_desde_rechazo === true,
      historico_motivo: trim(opts.reason),
      reemplazado_por: sanitizeUploadName(opts.replacedByFileName || ""),
      reason: trim(state.motivo || doc.motivo || doc.reason),
      perfil_estatus: trim(record.get("perfil_estatus")),
      perfil_validado: record.get("perfil_validado") === true,
      perfil_completo: record.get("perfil_completo") === true
    };
  }

  function archiveClientDocumentMirrorRecords(records, keepId, options) {
    const source = Array.isArray(records) ? records : [];
    const safeKeepId = trim(keepId);
    const opts = options && typeof options === "object" ? options : {};
    const reason = trim(opts.reason) || "reemplazado";
    const replacedByFileName = sanitizeUploadName(opts.replacedByFileName || "");
    const archivedAt = new Date().toISOString();
    for (let i = 0; i < source.length; i += 1) {
      const row = source[i];
      if (!row) continue;
      if (safeKeepId && trim(row.get("id")) === safeKeepId) continue;
      try {
        const metadata = parseJsonObject(row.get("metadata"));
        row.set("vigente", false);
        row.set("metadata", {
          ...metadata,
          vigente: false,
          historico: true,
          historico_motivo: reason,
          historico_desde: archivedAt,
          reemplazado_por: replacedByFileName || trim(metadata.reemplazado_por)
        });
        $app.save(row);
      } catch (_) { }
    }
  }

  function syncClientDocumentMirrorField(record, field, docStates, validationDocs) {
    if (!record || !field) return;
    const tenant = normalizeTenant(record.get("tenant"));
    const clientId = getRecordId(record);
    if (!tenant || !clientId) return;
    const state = docStates[field] && typeof docStates[field] === "object" ? docStates[field] : {};
    const validationDoc = validationDocs[field] && typeof validationDocs[field] === "object" ? validationDocs[field] : {};

    const existing = findClientDocumentMirrorRecords(tenant, clientId, field);
    const currentFileName = sanitizeUploadName(getRecordFileName(record, field));
    if (!currentFileName) {
      archiveClientDocumentMirrorRecords(existing, "", {
        reason: isDocStateOmitted(state) ? "omitido" : "sin_documento_actual"
      });
      return;
    }

    const stored = readStoredRecordFile(record, field);
    if (!stored || !stored.bytes) return;

    const collection = getCollectionByName("documentos");
    if (!collection) return;
    const metadata = buildClientDocumentMirrorMetadata(record, field, state, validationDoc, currentFileName, {
      vigente: true
    });
    const ruta = buildClientDocumentMirrorPath(tenant, clientId, field, stored.storedFileName || currentFileName);
    const target = existing.find(function (row) {
      return trim(row.get("ruta")) === ruta;
    }) || findDocumentoByPath(tenant, ruta) || new Record(collection);
    const form = new RecordUpsertForm($app, target);
    form.grantSuperuserAccess();
    form.load({
      tenant: tenant,
      tipo: CLIENT_DOCUMENT_MIRROR_TYPE,
      nombre_original: currentFileName,
      ruta: ruta,
      cotizacion_id: "",
      cliente: clientId,
      documento_campo: field,
      estado: metadata.estado,
      omitido: metadata.omitido === true,
      vigente: true,
      metadata: metadata,
      archivo: $filesystem.fileFromBytes(stored.bytes, stored.storedFileName || currentFileName),
      updated_at: new Date().toISOString()
    });
    form.submit();
    archiveClientDocumentMirrorRecords(existing, trim(target.get("id")), {
      reason: "reemplazado",
      replacedByFileName: stored.storedFileName || currentFileName
    });
  }

  function upsertClientCustomDocumentRecord(record, definition, uploadedFile, stateInfo) {
    if (!record || !definition || definition.builtIn === true || !uploadedFile) return null;
    const tenant = normalizeTenant(record.get("tenant"));
    const clientId = getRecordId(record);
    const field = normalizeDocumentFieldKey(definition.field);
    if (!tenant || !clientId || !field) return null;
    const collection = getCollectionByName("documentos");
    if (!collection) throw new BadRequestError("No se encontro el almacen de documentos.");
    const originalName = sanitizeUploadName(uploadedFile.originalName || uploadedFile.name || definition.label || "documento.pdf");
    const existing = findClientDocumentMirrorRecords(tenant, clientId, field);
    const ruta = buildClientDocumentMirrorPath(tenant, clientId, field, originalName);
    const target = existing.find(function (row) {
      return trim(row.get("ruta")) === ruta;
    }) || findDocumentoByPath(tenant, ruta) || new Record(collection);
    const state = stateInfo && typeof stateInfo === "object" ? stateInfo : {};
    const metadata = {
      source: "cliente_expediente",
      tenant: tenant,
      cliente_id: clientId,
      cliente_nombre: trim(record.get("nombre_completo")),
      documento_campo: field,
      documento_nombre: definition.label || field,
      estado: trim(state.status) || "pendiente",
      omitido: state.omitido === true,
      vigente: true,
      historico: false,
      file_name: originalName,
      emitted_at: normalizeDate(state.fecha_documento || state.fecha),
      updated_at: trim(state.actualizado_at),
      updated_from_rejection: state.actualizado_desde_rechazo === true,
      reason: trim(state.motivo)
    };
    const form = new RecordUpsertForm($app, target);
    form.grantSuperuserAccess();
    form.load({
      tenant: tenant,
      tipo: CLIENT_DOCUMENT_MIRROR_TYPE,
      nombre_original: originalName,
      ruta: ruta,
      cotizacion_id: "",
      cliente: clientId,
      documento_campo: field,
      estado: metadata.estado,
      omitido: false,
      vigente: true,
      metadata: metadata,
      archivo: $filesystem.fileFromBytes(toBytes(uploadedFile), originalName),
      updated_at: new Date().toISOString()
    });
    form.submit();
    archiveClientDocumentMirrorRecords(existing, trim(target.get("id")), {
      reason: "reemplazado",
      replacedByFileName: originalName
    });
    return target;
  }

  function syncClientDocumentMirrors(record) {
    if (!record) return;
    const validation = parseJsonObject(record.get("expediente_validacion"));
    const validationDocs = parseJsonObject(validation.documents);
    const docStates = getRecordDocStateMap(record);
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      syncClientDocumentMirrorField(record, DOC_FIELDS[i], docStates, validationDocs);
    }
  }

  function buildPublicQuoteDownloadName(quoteRecord, kind, originalName) {
    const labels = {
      cotizacion: "Cotizacion",
      contrato: "Contrato",
      factura_pdf: "Factura",
      factura_xml: "FacturaXML",
      recibo: "Recibo"
    };
    const ext = fileExtension(originalName || "") || (kind === "factura_xml" ? ".xml" : ".pdf");
    const folio = trim(quoteRecord.get("numero_orden")) || trim(quoteRecord.get("id")).slice(0, 8) || "ARCHIVO";
    return sanitizeUploadName((labels[kind] || "Documento") + "_" + folio + ext);
  }

  function ensurePublicQuoteRecord(clientRecord, quoteId) {
    const safeQuoteId = sanitizeId(quoteId);
    if (!safeQuoteId) throw new BadRequestError("Debes indicar la cotizacion a descargar.");
    let record = null;
    try {
      record = $app.findRecordById("cotizaciones", safeQuoteId);
    } catch (_) {
      record = null;
    }
    if (!record) throw new NotFoundError("Cotizacion no encontrada.");
    if (!publicQuoteBelongsToClient(record, clientRecord)) {
      throw new ForbiddenError("No tienes acceso a este documento.");
    }
    return record;
  }

  function resolvePublicQuoteAsset(quoteRecord, kind, paymentIndex) {
    const normalizedKind = normalizePublicAssetKind(kind);
    if (!normalizedKind) return null;
    const tenant = normalizeTenant(quoteRecord.get("tenant"));
    if (normalizedKind === "recibo") {
      const payments = safeArray(quoteRecord.get("historial_pagos"));
      const index = Math.max(0, parseInt(paymentIndex, 10) || 0);
      const payment = payments[index] || null;
      const storedPath = trim(payment && (payment.file_path || payment.path || payment.url));
      if (!storedPath) return null;
      return readStoredDocumentPath(
        tenant,
        storedPath,
        buildPublicQuoteDownloadName(quoteRecord, "recibo", sanitizeUploadName(storedPath))
      );
    }

    const fieldMap = {
      cotizacion: { fileField: "cotizacion_final_file", pathField: "url_cotizacion_final" },
      contrato: { fileField: "contrato_file", pathField: "contrato_url" },
      factura_pdf: { fileField: "factura_pdf_file", pathField: "factura_pdf_url" },
      factura_xml: { fileField: "factura_xml_file", pathField: "factura_xml_url" }
    };
    const config = fieldMap[normalizedKind];
    if (!config) return null;

    const storedFile = readStoredRecordFile(quoteRecord, config.fileField);
    if (storedFile) {
      return {
        bytes: storedFile.bytes,
        mime: storedFile.mime,
        fileName: buildPublicQuoteDownloadName(quoteRecord, normalizedKind, storedFile.storedFileName)
      };
    }

    const storedPath = trim(quoteRecord.get(config.pathField));
    if (!storedPath) return null;
    return readStoredDocumentPath(
      tenant,
      storedPath,
      buildPublicQuoteDownloadName(quoteRecord, normalizedKind, sanitizeUploadName(storedPath))
    );
  }

  function applyResponseHeaders(e) {
    e.response.header().set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    e.response.header().set("Pragma", "no-cache");
    e.response.header().set("X-Content-Type-Options", "nosniff");
    e.response.header().set("Referrer-Policy", "no-referrer");
    e.response.header().set("X-Robots-Tag", "noindex, nofollow");
    e.response.header().set("X-Frame-Options", "DENY");
  }

  function normalizeAllowedTenants(record) {
    const raw = record ? record.get("allowed_tenants") : null;
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (_) { }
    }

    list = list
      .map(function (item) {
        return normalizeTenant(item);
      })
      .filter(Boolean);

    const tenantDefault = normalizeTenant(record ? record.get("tenant_default") : "");
    if (tenantDefault && list.indexOf(tenantDefault) === -1) list.push(tenantDefault);

    const role = trim(record?.getString ? record.getString("role") : "").toLowerCase();
    if (!list.length) {
      if (role === "admin" || role === "verificador") list = ["plaza_mayor", "casa_de_piedra"];
      else if (role === "plaza_mayor" || role === "casa_de_piedra") list = [role];
    }

    return list.filter(Boolean);
  }

  function canAuthAccessClient(authRecord, clientRecord) {
    if (!authRecord || !clientRecord) return false;
    const role = authRole(authRecord);
    if (role === "admin" || role === "verificador") return true;
    const clientTenant = normalizeTenant(clientRecord.get("tenant"));
    if (!clientTenant) return false;
    const allowed = normalizeAllowedTenants(authRecord);
    if (allowed.indexOf(clientTenant) !== -1) return true;
    return role === clientTenant;
  }

  function ensureClientRecord(clientId) {
    const safeId = sanitizeId(clientId);
    if (!safeId) throw new BadRequestError("Debes proporcionar el identificador del perfil.");
    let record = null;
    try {
      record = $app.findRecordById("clientes", safeId);
    } catch (_) {
      record = null;
    }
    if (!record) throw new NotFoundError("Perfil no encontrado.");
    return record;
  }

  function ensurePublicProfileSecret(record) {
    let recordToken = trim(record.get("perfil_publico_token"));
    if (!recordToken) {
      recordToken = randomToken();
      record.set("perfil_publico_token", recordToken);
      try {
        $app.save(record);
      } catch (_) { }
    }
    const appSecret = trim(
      $os.getenv(CLIENT_PROFILE_LINK_SECRET_ENV) ||
      $os.getenv($app.encryptionEnv()) ||
      ""
    );
    return appSecret ? (appSecret + ":" + recordToken) : recordToken;
  }

  function createClientProfileAccess(record) {
    const clientId = trim(record.get("id"));
    const tenant = normalizeTenant(record.get("tenant"));
    const expiresAt = new Date(Date.now() + (CLIENT_PROFILE_LINK_DURATION_SECONDS * 1000)).toISOString();
    const payload = {
      sub: clientId,
      clientId: clientId,
      tenant: tenant,
      purpose: CLIENT_PROFILE_LINK_PURPOSE,
      nonce: randomToken().slice(0, 24)
    };
    const accessToken = $security.createJWT(payload, ensurePublicProfileSecret(record), CLIENT_PROFILE_LINK_DURATION_SECONDS);
    return {
      accessToken,
      expiresAt
    };
  }

  function resolveAuthorizedAccess(accessToken) {
    const safeToken = trim(accessToken);
    if (!safeToken) {
      throw new UnauthorizedError("El enlace seguro no es valido o ya vencio.");
    }

    let unverified = null;
    try {
      unverified = $security.parseUnverifiedJWT(safeToken);
    } catch (_) {
      throw new UnauthorizedError("El enlace seguro no es valido o ya vencio.");
    }

    const clientId = sanitizeId(unverified?.sub || unverified?.clientId || "");
    const record = ensureClientRecord(clientId);

    let claims = null;
    try {
      claims = $security.parseJWT(safeToken, ensurePublicProfileSecret(record));
    } catch (_) {
      throw new UnauthorizedError("El enlace seguro no es valido o ya vencio.");
    }

    const claimPurpose = trim(claims?.purpose);
    const claimClientId = sanitizeId(claims?.sub || claims?.clientId || "");
    const claimTenant = normalizeTenant(claims?.tenant);
    const recordTenant = normalizeTenant(record.get("tenant"));
    if (
      claimPurpose !== CLIENT_PROFILE_LINK_PURPOSE ||
      !claimClientId ||
      claimClientId !== trim(record.get("id")) ||
      !claimTenant ||
      claimTenant !== recordTenant
    ) {
      throw new UnauthorizedError("El enlace seguro no es valido o ya vencio.");
    }

    return {
      record,
      claims,
      expiresAt: claims?.exp ? new Date(Number(claims.exp) * 1000).toISOString() : ""
    };
  }

  function assertValidConstanciaForSubmission(dateString) {
    const normalized = normalizeDate(dateString);
    if (!normalized) {
      throw new BadRequestError("Debes capturar la fecha de emision de la constancia de situacion fiscal.");
    }
    if (evaluateDocumentDate(normalized, 3650).reason === "future") {
      throw new BadRequestError("La fecha de la constancia fiscal no puede estar en el futuro.");
    }
    return normalized;
  }

  function assertValidComprobanteForSubmission(dateString) {
    const normalized = normalizeDate(dateString);
    if (!normalized) {
      throw new BadRequestError("Debes capturar la fecha de emision del comprobante de domicilio.");
    }
    if (evaluateDocumentDate(normalized, 3650).reason === "future") {
      throw new BadRequestError("La fecha del comprobante de domicilio no puede estar en el futuro.");
    }
    return toPocketBaseDateTime(normalized);
  }

  function assertValidGenericDocumentDate(dateString, label) {
    const normalized = normalizeDate(dateString);
    if (!normalized) {
      throw new BadRequestError("Debes capturar la fecha del documento " + (label || "") + ".");
    }
    if (evaluateDocumentDate(normalized, 3650).reason === "future") {
      throw new BadRequestError("La fecha del documento " + (label || "") + " no puede estar en el futuro.");
    }
    return normalized;
  }

  function handleRecordCreateRequest(e) {
    if (!e || !e.record) return e.next();
    e.record.set("nombre_completo", sanitizeText(e.record.get("nombre_completo"), 255));
    e.record.set("correo", sanitizeText(e.record.get("correo"), 255).toLowerCase());
    e.record.set("telefono", normalizePhone(e.record.get("telefono")));
    e.record.set("rfc", sanitizeText(e.record.get("rfc"), 40).toUpperCase());
    e.record.set("telefonos_adicionales", sanitizePhones(e.record.get("telefonos_adicionales")));
    e.record.set("correos_adicionales", sanitizeEmails(e.record.get("correos_adicionales")));
    const profileOrigin = sanitizeText(e.record.get("perfil_origen"), 40).toLowerCase();
    e.record.set("perfil_origen", profileOrigin === "cotizacion_rapida" ? "cotizacion_rapida" : "manual");
    validateUploadedFilesForRequest(e);
    applyValidationToRecord(e.record, { touchPublicUpdateAt: false });
    e.next();
    try {
      const savedRecord = resolveClientRecord(getRecordId(e.record)) || e.record;
      applyValidationToRecord(savedRecord, { touchPublicUpdateAt: false });
      syncClientDocumentMirrors(savedRecord);
    } catch (mirrorErr) {
      console.log("[clientes create] Error syncing document mirror:", String(mirrorErr));
    }
  }

  function handleRecordUpdateRequest(e) {
    if (!e || !e.record) return e.next();
    const original = typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
    const originalDocEstados = getRecordDocStateMap(original);
    const incomingDocEstados = getRecordDocStateMap(e.record);
    const incomingDocStateChanged = JSON.stringify(incomingDocEstados) !== JSON.stringify(originalDocEstados);
    if (incomingDocStateChanged) {
      const isSuperuser = !!(e.hasSuperuserAuth && e.hasSuperuserAuth());
      const authRecord = e.auth || null;
      if (!isSuperuser && !canVerifyClientDocuments(authRecord)) {
        throw new ForbiddenError("Solo un usuario con rango Verificador puede validar documentos.");
      }
      const tenant = normalizeTenant(e.record.get("tenant"));
      const incomingConstanciaState = incomingDocEstados.doc_constancia_fiscal && typeof incomingDocEstados.doc_constancia_fiscal === "object"
        ? incomingDocEstados.doc_constancia_fiscal
        : {};
      const previousConstanciaState = originalDocEstados.doc_constancia_fiscal && typeof originalDocEstados.doc_constancia_fiscal === "object"
        ? originalDocEstados.doc_constancia_fiscal
        : {};
      if (normalizeDocDecisionOmitted(incomingConstanciaState) && !normalizeDocDecisionOmitted(previousConstanciaState)) {
        throw new BadRequestError("La constancia de situacion fiscal no puede marcarse como omitida.");
      }
      const actor = buildAuthActorMeta(authRecord);
      const reviewedAt = new Date().toISOString();
      const reviewFields = [];
      DOC_FIELDS.forEach(function (field) { if (reviewFields.indexOf(field) === -1) reviewFields.push(field); });
      Object.keys(incomingDocEstados || {}).forEach(function (field) {
        const normalized = normalizeDocumentFieldKey(field);
        if (normalized && reviewFields.indexOf(normalized) === -1) reviewFields.push(normalized);
      });
      for (let i = 0; i < reviewFields.length; i += 1) {
        const field = reviewFields[i];
        if (!Object.prototype.hasOwnProperty.call(incomingDocEstados, field)) continue;
        if (!getDocumentDefinitionByField(tenant, field) && !isBuiltInDocumentField(field)) continue;
        const nextState = incomingDocEstados[field] && typeof incomingDocEstados[field] === "object"
          ? incomingDocEstados[field]
          : {};
        const prevState = originalDocEstados[field] && typeof originalDocEstados[field] === "object"
          ? originalDocEstados[field]
          : {};
        const nextOmitted = normalizeDocDecisionOmitted(nextState);
        const prevOmitted = normalizeDocDecisionOmitted(prevState);
        if (!canDocumentBeOmitted(field, tenant) && nextOmitted && !prevOmitted) {
          throw new BadRequestError("Este documento no puede marcarse como omitido.");
        }
        const changed = (
          normalizeDocDecisionStatus(nextState) !== normalizeDocDecisionStatus(prevState) ||
          normalizeDocDecisionReason(nextState) !== normalizeDocDecisionReason(prevState) ||
          nextOmitted !== prevOmitted
        );
        if (!changed) continue;
        nextState.revisado_por_id = actor.id;
        nextState.revisado_por_nombre = actor.name;
        nextState.revisado_at = reviewedAt;
        nextState.actualizado_at = "";
        nextState.actualizado_desde_rechazo = false;
        if (normalizeDocDecisionStatus(nextState) === "aprobado" || normalizeDocDecisionOmitted(nextState)) {
          nextState.aprobado_por_id = actor.id;
          nextState.aprobado_por_nombre = actor.name;
          nextState.aprobado_at = reviewedAt;
        } else if (normalizeDocDecisionStatus(nextState) !== "aprobado") {
          nextState.aprobado_por_id = "";
          nextState.aprobado_por_nombre = "";
          nextState.aprobado_at = "";
        }
        incomingDocEstados[field] = nextState;
      }
      e.record.set("documentos_estado", incomingDocEstados);
    }
    try {
      e.record.set("nombre_completo", sanitizeText(e.record.get("nombre_completo"), 255));
      e.record.set("correo", sanitizeText(e.record.get("correo"), 255).toLowerCase());
      e.record.set("telefono", normalizePhone(e.record.get("telefono")));
      e.record.set("rfc", sanitizeText(e.record.get("rfc"), 40).toUpperCase());
      e.record.set("telefonos_adicionales", sanitizePhones(e.record.get("telefonos_adicionales")));
      e.record.set("correos_adicionales", sanitizeEmails(e.record.get("correos_adicionales")));
      e.record.set(
        "comprobante_domicilio_emitido_el",
        toPocketBaseDateTime(e.record.get("comprobante_domicilio_emitido_el"))
      );
    } catch (fieldErr) {
      console.log("[clientes update] Error sanitizing fields:", String(fieldErr));
    }
    try {
      validateUploadedFilesForRequest(e);
    } catch (uploadErr) {
      // Re-throw BadRequestError (user facing) but catch runtime errors
      if (uploadErr && typeof uploadErr.message === "string" && (
        uploadErr.message.indexOf("archivo") !== -1 ||
        uploadErr.message.indexOf("extension") !== -1 ||
        uploadErr.message.indexOf("Solo puedes") !== -1
      )) {
        throw uploadErr;
      }
      console.log("[clientes update] Error validating uploads:", String(uploadErr));
    }
    try {
      applyValidationToRecord(e.record, { touchPublicUpdateAt: false });
    } catch (validationErr) {
      console.log("[clientes update] Error applying validation:", String(validationErr));
    }

    // Si se subieron nuevos documentos o cambió la fecha de constancia, revocamos la validación
    // Si se subieron nuevos documentos, chequeamos bloqueos y reseteamos el estado a pendiente
    try {
      let docEstados = getRecordDocStateMap(e.record);

      const uploaded = validateUploadedFilesForRequest(e);
      let changed = false;

      for (let i = 0; i < DOC_FIELDS.length; i += 1) {
        const field = DOC_FIELDS[i];
        if (uploaded[field]) {
          const uploadedFile = uploaded[field].file || uploaded[field];
          const dStat = docEstados[field] && docEstados[field].status ? docEstados[field].status : "";
          // Block if the user is not an admin and the file is locked
          const admin = e.httpContext ? e.httpContext.get("admin") : null;
          if (!admin && (dStat === "aprobado" || dStat === "pendiente") && hasValue(e.record.get(field))) {
            throw new BadRequestError("El documento " + DOC_LABELS[field] + " esta bloqueado (en revision o aprobado) y no puede ser modificado.");
          }
          docEstados[field] = {
            status: "pendiente",
            motivo: "",
            omitido: false,
            subido_at: new Date().toISOString(),
            actualizado_at: new Date().toISOString(),
            actualizado_desde_rechazo: dStat === "rechazado"
          };
          changed = true;
        }
      }

      const hasNewConstanciaUpload = !!uploaded.doc_constancia_fiscal;
      const constanciaWasApproved = isDocStateApproved(originalDocEstados.doc_constancia_fiscal);
      if (
        original &&
        trim(e.record.get("constancia_fiscal_emitida_el")) !== trim(original.get("constancia_fiscal_emitida_el")) &&
        (hasNewConstanciaUpload || !constanciaWasApproved)
      ) {
        if (!docEstados["doc_constancia_fiscal"]) docEstados["doc_constancia_fiscal"] = {};
        const previousConstanciaStatus = trim(docEstados["doc_constancia_fiscal"].status).toLowerCase();
        docEstados["doc_constancia_fiscal"].status = "pendiente";
        docEstados["doc_constancia_fiscal"].motivo = "";
        docEstados["doc_constancia_fiscal"].omitido = false;
        docEstados["doc_constancia_fiscal"].subido_at = new Date().toISOString();
        docEstados["doc_constancia_fiscal"].actualizado_at = new Date().toISOString();
        docEstados["doc_constancia_fiscal"].actualizado_desde_rechazo = previousConstanciaStatus === "rechazado";
        changed = true;
      }

      const hasNewComprobanteUpload = !!uploaded.doc_comprobante_domicilio;
      const comprobanteWasApproved = isDocStateApprovedOrOmitted(originalDocEstados.doc_comprobante_domicilio);
      if (
        original &&
        trim(e.record.get("comprobante_domicilio_emitido_el")) !== trim(original.get("comprobante_domicilio_emitido_el")) &&
        (hasNewComprobanteUpload || !comprobanteWasApproved)
      ) {
        if (!docEstados["doc_comprobante_domicilio"]) docEstados["doc_comprobante_domicilio"] = {};
        const previousComprobanteStatus = trim(docEstados["doc_comprobante_domicilio"].status).toLowerCase();
        docEstados["doc_comprobante_domicilio"].status = "pendiente";
        docEstados["doc_comprobante_domicilio"].motivo = "";
        docEstados["doc_comprobante_domicilio"].omitido = false;
        docEstados["doc_comprobante_domicilio"].subido_at = new Date().toISOString();
        docEstados["doc_comprobante_domicilio"].actualizado_at = new Date().toISOString();
        docEstados["doc_comprobante_domicilio"].actualizado_desde_rechazo = previousComprobanteStatus === "rechazado";
        changed = true;
      }

      if (changed) {
        e.record.set("documentos_estado", docEstados);
        applyValidationToRecord(e.record, { touchPublicUpdateAt: false });
      }
    } catch (revocationErr) {
      if (revocationErr && revocationErr.message && revocationErr.message.indexOf("bloqueado") !== -1) {
        throw revocationErr;
      }
      console.log("[clientes update] Error checking revocation:", String(revocationErr));
    }

    e.next();
    try {
      const savedRecord = resolveClientRecord(getRecordId(e.record)) || e.record;
      applyValidationToRecord(savedRecord, { touchPublicUpdateAt: false });
      syncClientDocumentMirrors(savedRecord);
    } catch (mirrorErr) {
      console.log("[clientes update] Error syncing document mirror:", String(mirrorErr));
    }
  }

  function handleRecordEnrich(e) {
    const authRecord = e.requestInfo && e.requestInfo.auth ? e.requestInfo.auth : null;
    const isSuperuser = !!(e.hasSuperuserAuth && e.hasSuperuserAuth());
    applyValidationToRecord(e.record, { touchPublicUpdateAt: false });
    if (!authRecord || isSuperuser || canVerifyClientDocuments(authRecord)) return e.next();
    const docEstados = getRecordDocStateMap(e.record);
    const filteredStates = {};
    const tenant = normalizeTenant(e.record.get("tenant"));
    const definitions = getDocumentDefinitionsForTenant(tenant);
    for (let i = 0; i < definitions.length; i += 1) {
      const field = definitions[i].field;
      const state = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
      const approved = normalizeDocDecisionStatus(state) === "aprobado" || (canDocumentBeOmitted(field, tenant) && normalizeDocDecisionOmitted(state));
      if (!approved && isBuiltInDocumentField(field)) {
        e.record.hide(field);
        continue;
      }
      filteredStates[field] = state;
    }
    e.record.set("documentos_estado", filteredStates);
    return e.next();
  }

  function handlePublicClientVerify(e) {
    applyResponseHeaders(e);

    const payload = new DynamicModel({
      clientId: "",
      phone: ""
    });
    e.bindBody(payload);

    const clientId = sanitizeId(payload.clientId);
    const rawPhone = normalizePhone(payload.phone);

    // Validate inputs without revealing whether the client ID exists
    // (use generic error message to prevent user enumeration)
    if (!clientId || !rawPhone) {
      throw new BadRequestError("Debes proporcionar tu ID de cliente y numero de telefono.");
    }

    let record = null;
    try {
      record = $app.findRecordById("clientes", clientId);
    } catch (_) {
      record = null;
    }

    // Constant-time failure: even if not found, do some work to avoid timing attacks
    if (!record) {
      // Consume similar time as a real comparison
      const dummy = normalizePhone("5511223344");
      if (rawPhone === dummy && rawPhone === "0000000000") { } // always false
      throw new UnauthorizedError("ID de cliente o telefono incorrecto. Verifica tus datos.");
    }

    // Check primary phone
    const primaryPhone = normalizePhone(record.get("telefono"));

    // Check additional phones
    const additionalPhones = sanitizePhones(record.get("telefonos_adicionales"));

    const allPhones = [];
    if (primaryPhone) allPhones.push(primaryPhone);
    for (let i = 0; i < additionalPhones.length; i++) {
      if (allPhones.indexOf(additionalPhones[i]) === -1) allPhones.push(additionalPhones[i]);
    }

    // Compare phone against all valid phones for this client
    let phoneMatches = false;
    for (let i = 0; i < allPhones.length; i++) {
      if (allPhones[i] === rawPhone) {
        phoneMatches = true;
        break;
      }
    }

    if (!phoneMatches) {
      throw new UnauthorizedError("ID de cliente o telefono incorrecto. Verifica tus datos.");
    }

    // Phone is valid — generate an access token (same as admin-generated link)
    const access = createClientProfileAccess(record);
    return e.json(200, {
      ok: true,
      accessToken: access.accessToken,
      expiresAt: access.expiresAt,
      clientId: trim(record.get("id")),
      tenant: normalizeTenant(record.get("tenant")) || "plaza_mayor"
    });
  }

  function handleClientProfileLink(e) {
    applyResponseHeaders(e);

    // Manual auth validation: extract the token from the Authorization header
    // This avoids CORS/middleware conflicts that cause 400 errors when using $apis.requireAuth
    const authHeader = trim(e.request.header.get("Authorization") || "");
    if (!authHeader) {
      throw new UnauthorizedError("Debes iniciar sesion para generar el enlace seguro.");
    }

    let authRecord = null;
    try {
      authRecord = $app.findAuthRecordByToken(authHeader, "auth");
    } catch (_) {
      authRecord = null;
    }
    if (!authRecord) {
      throw new UnauthorizedError("Sesion invalida o expirada. Por favor inicia sesion nuevamente.");
    }

    // Verify the auth record belongs to the expected collection
    if (trim(authRecord.collection().name) !== AUTH_COLLECTION) {
      throw new ForbiddenError("No tienes acceso a esta funcion.");
    }

    const payload = new DynamicModel({
      id: "",
      clientId: ""
    });
    e.bindBody(payload);

    const clientRecord = ensureClientRecord(payload.clientId || payload.id);
    if (!canAuthAccessClient(authRecord, clientRecord)) {
      throw new ForbiddenError("No tienes acceso a este perfil.");
    }

    const access = createClientProfileAccess(clientRecord);
    return e.json(200, {
      ok: true,
      accessToken: access.accessToken,
      expiresAt: access.expiresAt,
      clientId: trim(clientRecord.get("id"))
    });
  }

  function sanitizeArchiveDownloadName(name, fallbackClientId) {
    let safe = sanitizeUploadName(name || "");
    if (!safe) safe = `expediente_${sanitizeId(fallbackClientId || "cliente")}.zip`;
    if (!/\.zip$/i.test(safe)) safe += ".zip";
    return safe;
  }

  function runZipCommand(args, workdir) {
    const cmd = $os.cmd("7z", ...args);
    if (workdir) cmd.dir = workdir;
    return toString(cmd.combinedOutput() || "");
  }

  function handleProtectedClientZipDownload(e) {
    applyResponseHeaders(e);

    const authHeader = trim(e.request.header.get("Authorization") || "");
    if (!authHeader) {
      throw new UnauthorizedError("Debes iniciar sesion para descargar el ZIP protegido.");
    }

    let authRecord = null;
    try {
      authRecord = $app.findAuthRecordByToken(authHeader, "auth");
    } catch (_) {
      authRecord = null;
    }
    if (!authRecord) {
      throw new UnauthorizedError("Sesion invalida o expirada. Por favor inicia sesion nuevamente.");
    }
    if (trim(authRecord.collection().name) !== AUTH_COLLECTION) {
      throw new ForbiddenError("No tienes acceso a esta funcion.");
    }

    const clientRecord = ensureClientRecord(e.formValue("clientId"));
    if (!canAuthAccessClient(authRecord, clientRecord)) {
      throw new ForbiddenError("No tienes acceso a este perfil.");
    }

    let formFile = null;
    try {
      formFile = e.request.formFile("archive");
    } catch (_) {
      formFile = null;
    }
    const archiveFile = Array.isArray(formFile) ? formFile[0] : null;
    if (!archiveFile) {
      throw new BadRequestError("Debes adjuntar el archivo ZIP del expediente.");
    }

    const archiveName = sanitizeUploadName(archiveFile.originalName || archiveFile.name || "expediente.zip") || "expediente.zip";
    if (fileExtension(archiveName) !== ".zip") {
      throw new BadRequestError("Debes adjuntar un archivo ZIP valido del expediente.");
    }
    const archiveBytes = toBytes(archiveFile);
    if (archiveFile && typeof archiveFile.close === "function") {
      try { archiveFile.close(); } catch (_) { }
    }
    if (!archiveBytes || !archiveBytes.length) {
      throw new BadRequestError("El archivo ZIP recibido esta vacio.");
    }
    scanBytesInQuarantine(archiveBytes, archiveName, "ZIP del expediente");

    const tempRoot = $filepath.join($os.tempDir(), `client_zip_${randomToken().slice(0, 12)}`);
    const sourceZipPath = $filepath.join(tempRoot, "source.zip");
    const extractDir = $filepath.join(tempRoot, "extract");
    const protectedZipPath = $filepath.join(tempRoot, "protected.zip");
    const jsonManifestPath = $filepath.join(extractDir, "informacion_personal", "datos_cliente.json");
    const downloadName = sanitizeArchiveDownloadName(e.formValue("filename"), trim(clientRecord.get("id")));
    const password = trim(clientRecord.get("id"));

    try {
      $os.mkdirAll(tempRoot, 448);
      $os.writeFile(sourceZipPath, archiveBytes, 384);
      $os.mkdirAll(extractDir, 448);

      runZipCommand(["x", "-y", `-o${extractDir}`, sourceZipPath]);

      try { $os.remove(jsonManifestPath); } catch (_) { }

      let hasFiles = false;
      $filepath.walkDir(extractDir, function (path, info, err) {
        if (err || !info) return;
        if (path === extractDir) return;
        if (info.isDir && info.isDir()) return;
        hasFiles = true;
      });
      if (!hasFiles) {
        throw new BadRequestError("No hay archivos validos para incluir en el ZIP protegido.");
      }

      runZipCommand(["a", "-y", "-tzip", `-p${password}`, "-mem=AES256", protectedZipPath, "*"], extractDir);

      const protectedBytes = toBytes($os.readFile(protectedZipPath));
      e.response.header().set("Content-Disposition", `attachment; filename="${downloadName}"`);
      return e.blob(200, "application/zip", protectedBytes);
    } catch (err) {
      const message = trim(err && err.message ? err.message : String(err || ""));
      if (
        err instanceof BadRequestError ||
        err instanceof UnauthorizedError ||
        err instanceof ForbiddenError ||
        err instanceof NotFoundError
      ) {
        throw err;
      }
      console.log("[client_profile] protected zip error:", message || String(err));
      throw new InternalServerError("No se pudo proteger el ZIP del expediente.");
    } finally {
      try { $os.removeAll(tempRoot); } catch (_) { }
    }
  }

  function handlePublicClientProfileGet(e) {
    applyResponseHeaders(e);
    const query = e.request.url.query();
    const access = resolveAuthorizedAccess(query.get("access"));
    const validation = buildValidation(access.record);
    return e.json(200, {
      ok: true,
      profile: buildPublicProfilePayload(access.record, validation, access)
    });
  }

  function handlePublicClientFile(e) {
    applyResponseHeaders(e);
    const query = e.request.url.query();
    const access = resolveAuthorizedAccess(query.get("access"));
    const quoteRecord = ensurePublicQuoteRecord(access.record, query.get("quoteId"));
    const asset = resolvePublicQuoteAsset(quoteRecord, query.get("kind"), query.get("paymentIndex"));
    if (!asset || !asset.bytes || !asset.fileName) {
      throw new NotFoundError("El documento solicitado no esta disponible.");
    }
    const safeName = sanitizeUploadName(asset.fileName).replace(/"/g, "");
    e.response.header().set("Content-Disposition", `attachment; filename="${safeName || "documento"}"`);
    return e.blob(200, asset.mime || "application/octet-stream", asset.bytes);
  }

  // Cierra el submit publico del expediente: guarda archivos, fechas y datos fiscales extraidos.
  function handlePublicClientProfileComplete(e) {
    applyResponseHeaders(e);

    const payload = new DynamicModel({
      access: "",
      accessToken: "",
      nombreCompleto: "",
      nombre_completo: "",
      razonSocial: "",
      razon_social: "",
      telefono: "",
      phone: "",
      telefonoPrincipal: "",
      telefono_principal: "",
      additionalPhones: "",
      telefonosAdicionales: "",
      telefonos_adicionales: "",
      additionalEmails: "",
      correosAdicionales: "",
      correos_adicionales: "",
      correo: "",
      email: "",
      rfc: "",
      documentos_fechas: "",
      documentDates: "",
      document_dates: "",
      comprobanteDomicilioEmitidoEl: "",
      comprobante_domicilio_emitido_el: "",
      constanciaFiscalEmitidaEl: "",
      constanciaIssuedAt: "",
      constancia_fiscal_emitida_el: ""
    });
    e.bindBody(payload);

    let requestBody = {};
    try {
      const info = typeof e.requestInfo === "function" ? e.requestInfo() : null;
      requestBody = info && info.body && typeof info.body === "object" ? info.body : {};
    } catch (_) {
      requestBody = {};
    }
    const formValue = function (key) {
      const fromBody = requestBody && Object.prototype.hasOwnProperty.call(requestBody, key) ? requestBody[key] : "";
      if (Array.isArray(fromBody)) return fromBody.length ? fromBody[0] : "";
      if (fromBody !== null && fromBody !== undefined && trim(fromBody)) return fromBody;
      if (typeof e.formValue === "function") return e.formValue(key);
      if (e.request && typeof e.request.formValue === "function") return e.request.formValue(key);
      return "";
    };
    const submittedValue = function () {
      for (let i = 0; i < arguments.length; i += 1) {
        const value = arguments[i];
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
          if (value.length) return value;
          continue;
        }
        if (typeof value === "object") {
          const rawObjectString = trim(String(value));
          if (rawObjectString && rawObjectString !== "[object Object]") return value;
          continue;
        }
        if (trim(value)) return value;
      }
      return "";
    };

    const access = resolveAuthorizedAccess(submittedValue(payload.access, payload.accessToken, formValue("access"), formValue("accessToken")));
    const record = access.record;
    const uploadedFiles = validateUploadedFilesForRequest(e, record.get("tenant"));
    const requestedBusinessName = sanitizeText(submittedValue(
      payload.nombreCompleto,
      payload.nombre_completo,
      payload.razonSocial,
      payload.razon_social,
      formValue("nombreCompleto"),
      formValue("nombre_completo"),
      formValue("razonSocial"),
      formValue("razon_social")
    ), 255);
    const requestedPhoneRaw = trim(submittedValue(
      payload.telefono,
      payload.phone,
      payload.telefonoPrincipal,
      payload.telefono_principal,
      formValue("telefono"),
      formValue("phone"),
      formValue("telefonoPrincipal"),
      formValue("telefono_principal")
    ));
    const requestedPhone = normalizePhone(requestedPhoneRaw);
    const additionalPhones = sanitizePhones(submittedValue(
      payload.additionalPhones,
      payload.telefonosAdicionales,
      payload.telefonos_adicionales,
      formValue("additionalPhones"),
      formValue("telefonosAdicionales"),
      formValue("telefonos_adicionales")
    )).slice(0, 2);
    const additionalEmails = sanitizeEmails(submittedValue(
      payload.additionalEmails,
      payload.correosAdicionales,
      payload.correos_adicionales,
      formValue("additionalEmails"),
      formValue("correosAdicionales"),
      formValue("correos_adicionales")
    )).slice(0, 2);
    const requestedEmail = normalizeEmail(submittedValue(payload.correo, payload.email, formValue("correo"), formValue("email")));
    const requestedRfc = sanitizeText(submittedValue(payload.rfc, formValue("rfc")), 40).toUpperCase();
    const submittedDocumentDates = parseJsonObject(
      submittedValue(
        payload.documentos_fechas,
        payload.documentDates,
        payload.document_dates,
        formValue("documentos_fechas"),
        formValue("documentDates"),
        formValue("document_dates")
      )
    );
    const docEstados = getRecordDocStateMap(record);
    const rawConstanciaDate = trim(submittedValue(
      payload.constanciaFiscalEmitidaEl,
      payload.constanciaIssuedAt,
      payload.constancia_fiscal_emitida_el,
      formValue("constanciaFiscalEmitidaEl"),
      formValue("constanciaIssuedAt"),
      formValue("constancia_fiscal_emitida_el")
    ));
    const rawComprobanteDate = trim(submittedValue(
      payload.comprobanteDomicilioEmitidoEl,
      payload.comprobante_domicilio_emitido_el,
      formValue("comprobanteDomicilioEmitidoEl"),
      formValue("comprobante_domicilio_emitido_el")
    ));
    const hasConstanciaUpload = !!uploadedFiles.doc_constancia_fiscal;
    const hasComprobanteUpload = !!uploadedFiles.doc_comprobante_domicilio;
    let constanciaDate = null;
    let comprobanteDate = null;

    if (rawConstanciaDate || hasConstanciaUpload) {
      constanciaDate = assertValidConstanciaForSubmission(rawConstanciaDate);
    }

    if (rawComprobanteDate || hasComprobanteUpload) {
      comprobanteDate = assertValidComprobanteForSubmission(rawComprobanteDate);
    }

    if (trim(submittedValue(payload.correo, payload.email, formValue("correo"), formValue("email"))) && !requestedEmail) {
      throw new BadRequestError("El correo proporcionado no es valido.");
    }
    if (requestedPhoneRaw && !requestedPhone) {
      throw new BadRequestError("El telefono principal proporcionado no es valido.");
    }

    const effectiveMainPhone = requestedPhone || normalizePhone(record.get("telefono"));
    const filteredAdditionalPhones = additionalPhones.filter(function (phone) {
      return phone && phone !== effectiveMainPhone;
    });

    record.set("telefonos_adicionales", filteredAdditionalPhones);
    record.set("correos_adicionales", additionalEmails);
    if (requestedPhone) record.set("telefono", requestedPhone);
    if (requestedEmail) record.set("correo", requestedEmail);
    if (requestedBusinessName && hasConstanciaUpload) record.set("nombre_completo", requestedBusinessName);
    if (requestedRfc && hasConstanciaUpload) record.set("rfc", requestedRfc);
    if (constanciaDate !== null) record.set("constancia_fiscal_emitida_el", constanciaDate);
    if (comprobanteDate !== null) record.set("comprobante_domicilio_emitido_el", comprobanteDate);

    const uploadedDocNotifications = [];
    let docEstadosChanged = false;
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      if (uploadedFiles[field]) {
        const uploadInfo = uploadedFiles[field];
        const uploadFile = uploadInfo.file || uploadInfo;
        const currentState = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
        const currentStatus = normalizeDocDecisionStatus(currentState);
        const existingFilePresent = hasValue(record.get(field));
        if (
          (existingFilePresent && currentStatus !== "rechazado") ||
          isDocStateOmitted(currentState)
        ) {
          throw new BadRequestError("El documento " + (DOC_LABELS[field] || field) + " ya fue aprobado o esta en revision.");
        }
        record.set(field, uploadFile);
        docEstados[field] = {
          status: "pendiente",
          motivo: "",
          omitido: false,
          subido_at: new Date().toISOString(),
          actualizado_at: new Date().toISOString(),
          actualizado_desde_rechazo: currentStatus === "rechazado"
        };
        docEstadosChanged = true;
        uploadedDocNotifications.push({
          field,
          label: DOC_LABELS[field] || field,
          type: "documento_subido"
        });
      }
    }
    const customDefinitions = getDocumentDefinitionsForTenant(record.get("tenant")).filter(function (def) {
      return def.custom === true;
    });
    for (let i = 0; i < customDefinitions.length; i += 1) {
      const definition = customDefinitions[i];
      const field = definition.field;
      const uploadInfo = uploadedFiles[field];
      if (!uploadInfo) continue;
      try {
        const uploadFile = uploadInfo.file || uploadInfo;
        const currentState = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
        const currentStatus = normalizeDocDecisionStatus(currentState);
        const existingDoc = getLatestClientDocumentRecord(record.get("tenant"), getRecordId(record), field);
        const existingFilePresent = !!(existingDoc && getRecordFileName(existingDoc, "archivo"));
        if ((existingFilePresent && currentStatus !== "rechazado") || isDocStateOmitted(currentState)) {
          throw new BadRequestError("El documento " + (definition.label || field) + " ya fue aprobado o esta en revision.");
        }
        const dateValue = trim(
          submittedDocumentDates[field] ||
          submittedDocumentDates[definition.uploadField] ||
          payload[definition.uploadField + "_date"] ||
          payload[definition.uploadField + "_fecha"] ||
          payload[field + "_fecha_documento"] ||
          payload[field + "_date"] ||
          formValue(definition.uploadField + "_date") ||
          formValue(definition.uploadField + "_fecha") ||
          formValue(field + "_fecha_documento") ||
          formValue(field + "_date")
        );
        const nextState = {
          status: "pendiente",
          motivo: "",
          omitido: false,
          subido_at: new Date().toISOString(),
          actualizado_at: new Date().toISOString(),
          actualizado_desde_rechazo: currentStatus === "rechazado"
        };
        if (definition.requiresDate === true || dateValue) {
          nextState.fecha_documento = assertValidGenericDocumentDate(dateValue, definition.label);
        }
        docEstados[field] = nextState;
        upsertClientCustomDocumentRecord(record, definition, uploadFile, nextState);
        docEstadosChanged = true;
        uploadedDocNotifications.push({
          field,
          label: definition.label || field,
          type: "documento_subido"
        });
      } catch (customDocErr) {
        console.log("[clientes public complete] Error processing custom document", field, String(customDocErr));
        throw customDocErr && customDocErr.name === "BadRequestError"
          ? customDocErr
          : new BadRequestError("No se pudo guardar el documento " + (definition.label || field) + ".");
      }
    }
    if (docEstadosChanged) {
      record.set("documentos_estado", docEstados);
    }

    const validation = applyValidationToRecord(record, { touchPublicUpdateAt: true });

    try {
      $app.save(record);
    } catch (_) {
      throw new BadRequestError("No se pudo guardar el expediente del cliente.");
    }

    try {
      syncClientDocumentMirrors(record);
    } catch (mirrorErr) {
      console.log("[clientes public complete] Error syncing document mirror:", String(mirrorErr));
    }

    if (uploadedDocNotifications.length) {
      const notifier = getNotificationsApi();
      if (typeof notifier.notifyClientDocumentsUploaded === "function") {
        notifier.notifyClientDocumentsUploaded({
          id: trim(record.get("id")),
          tenant: normalizeTenant(record.get("tenant")),
          name: trim(record.get("nombre_completo")) || "Cliente"
        }, uploadedDocNotifications, { id: "", name: "Cliente externo", role: "externo" });
      }
    }

    return e.json(200, {
      ok: true,
      message: validation.ready
        ? "Expediente validado correctamente. El perfil ya esta listo para cotizar."
        : "Expediente guardado. Aun faltan elementos para validarlo por completo.",
      profile: buildPublicProfilePayload(record, validation, access)
    });
  }

  function refreshClientValidationById(clientId) {
    const safeClientId = sanitizeId(clientId);
    if (!safeClientId) return;
    let record = null;
    try {
      record = $app.findRecordById("clientes", safeClientId);
    } catch (_) {
      record = null;
    }
    if (!record) return;
    applyValidationToRecord(record, { touchPublicUpdateAt: true });
    try {
      $app.save(record);
    } catch (err) {
      console.log("[client_profile] Error refreshing client validation:", String(err));
    }
  }

  function resolveClientIdFromDictamenEvent(e) {
    let clientId = "";
    let dictamenId = "";
    try {
      if (e && e.record) {
        clientId = trim(e.record.get("cliente"));
        dictamenId = sanitizeId(e.record.get("id"));
      }
    } catch (_) { }
    if (clientId) return clientId;
    if (!dictamenId) return "";
    try {
      const persisted = $app.findRecordById("clientes_dictamenes", dictamenId);
      return trim(persisted.get("cliente"));
    } catch (_) {
      return "";
    }
  }

  function handleClientDictamenChanged(e) {
    const clientId = resolveClientIdFromDictamenEvent(e);
    e.next();
    refreshClientValidationById(clientId);
  }

  function handleClientDictamenCommitted(e) {
    const clientId = resolveClientIdFromDictamenEvent(e);
    refreshClientValidationById(clientId);
  }

  module.exports = {
    handleRecordCreateRequest,
    handleRecordUpdateRequest,
    handleRecordEnrich,
    handlePublicClientVerify,
    handleClientProfileLink,
    handleProtectedClientZipDownload,
    handlePublicClientProfileGet,
    handlePublicClientFile,
    handlePublicClientProfileComplete,
    handleClientDictamenChanged,
    handleClientDictamenCommitted,
    evaluateClientProfileValidation: buildValidation,
    getClientDictamenStatus
  };
})();
