(function () {
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
  const CLIENT_PROFILE_LINK_DURATION_SECONDS = 48 * 60 * 60;
  const CLIENT_PROFILE_LINK_SECRET_ENV = "PB_CLIENT_PROFILE_LINK_SECRET";
  const CLIENT_PROFILE_LINK_PURPOSE = "public_client_profile";
  let notificationsApi = null;
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

  function parseJsonObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
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
    const activityDate = normalizeDate(state.subido_at)
      || normalizeDate(doc.subidoAt)
      || normalizeDate(doc.subido_at)
      || normalizeDate(state.aprobado_at)
      || normalizeDate(doc.aprobadoAt)
      || normalizeDate(doc.aprobado_at)
      || normalizeDate(state.revisado_at)
      || normalizeDate(doc.revisadoAt)
      || normalizeDate(doc.revisado_at)
      || normalizeDate(record ? record.get("created_at") : "")
      || normalizeDate(record ? record.get("created") : "");
    if (field === "doc_constancia_fiscal") {
      return activityDate
        || normalizeDate(record ? record.get("constancia_fiscal_emitida_el") : "")
        || normalizeDate(doc.validityDate);
    }
    if (field === "doc_comprobante_domicilio") {
      return normalizeDate(record ? record.get("comprobante_domicilio_emitido_el") : "")
        || normalizeDate(doc.validityDate)
        || activityDate;
    }
    return activityDate;
  }

  function buildClientDictamenDocumentSnapshot(record) {
    if (!record) return [];
    const validation = parseJsonObject(record.get("expediente_validacion"));
    const validationDocs = parseJsonObject(validation.documents);
    const states = normalizeDocStateMap(record.get("documentos_estado"));
    const snapshot = [];
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      const state = states[field] && typeof states[field] === "object" ? states[field] : {};
      const validationDoc = validationDocs[field] && typeof validationDocs[field] === "object" ? validationDocs[field] : {};
      const uploaded = hasValue(record.get(field)) || validationDoc.uploaded === true;
      const omitted = isDocStateOmitted(state) || validationDoc.omitido === true || validationDoc.omitted === true;
      let status = trim(validationDoc.estado || validationDoc.status || state.status);
      if (omitted) status = "omitido";
      else if (!uploaded) status = "pendiente";
      else if (!status) status = "pendiente";
      snapshot.push({
        field,
        label: DOC_LABELS[field] || field,
        fileName: getRecordFileName(record, field) || trim(validationDoc.fileName),
        uploaded,
        status,
        omitted,
        reason: trim(validationDoc.motivo || validationDoc.reason || state.motivo),
        validityDate: (field === "doc_constancia_fiscal" || field === "doc_comprobante_domicilio")
          ? getClientDocumentValidityReferenceDate(record, field, state, validationDoc)
          : "",
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
    if (Array.isArray(value)) return value;
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

  function validateUploadedFile(field, file) {
    const label = DOC_LABELS[field] || "Documento";
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

  function validateUploadedFilesForRequest(e) {
    const uploaded = {};
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      let files = [];
      try {
        files = e.findUploadedFiles(field) || [];
      } catch (_) {
        files = [];
      }
      if (files.length > 1) {
        throw new BadRequestError("Solo puedes subir un archivo por documento.");
      }
      if (files.length === 1) {
        validateUploadedFile(field, files[0]);
        uploaded[field] = files[0];
      }
    }
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

  function getRequiredDocFieldsForTenant(tenant) {
    const normalizedTenant = normalizeTenant(tenant);
    return REQUIRED_DOC_FIELDS_BY_TENANT[normalizedTenant] || REQUIRED_DOC_FIELDS_BY_TENANT.plaza_mayor;
  }

  function canDocumentBeOmitted(field) {
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
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) { }
    }
    return {};
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
    const requiredDocFields = getRequiredDocFieldsForTenant(tenant);
    const additionalPhones = sanitizePhones(record.get("telefonos_adicionales"));
    const mainPhone = normalizePhone(record.get("telefono"));
    const docEstados = normalizeDocStateMap(record.get("documentos_estado"));
    const constanciaState = docEstados.doc_constancia_fiscal && typeof docEstados.doc_constancia_fiscal === "object"
      ? docEstados.doc_constancia_fiscal
      : {};
    const comprobanteState = docEstados.doc_comprobante_domicilio && typeof docEstados.doc_comprobante_domicilio === "object"
      ? docEstados.doc_comprobante_domicilio
      : {};
    const constanciaDate = normalizeDate(record.get("constancia_fiscal_emitida_el"));
    const comprobanteDate = normalizeDate(record.get("comprobante_domicilio_emitido_el"));
    const constanciaLifecycleDate = getRecordLifecycleDate(record, constanciaState);
    const comprobanteLifecycleDate = getRecordLifecycleDate(record, comprobanteState);
    const constanciaUploadDate = normalizeDate(constanciaState.subido_at) || normalizeDate(constanciaState.aprobado_at) || normalizeDate(constanciaState.revisado_at) || constanciaDate || constanciaLifecycleDate;
    const comprobanteEffectiveDate = comprobanteDate || normalizeDate(comprobanteState.subido_at) || normalizeDate(comprobanteState.aprobado_at) || normalizeDate(comprobanteState.revisado_at) || comprobanteLifecycleDate;
    const constanciaInfo = evaluateDocumentDate(constanciaUploadDate, MAX_CONSTANCIA_VALID_DAYS);
    const comprobanteInfo = evaluateDocumentCalendarMonths(comprobanteEffectiveDate, MAX_COMPROBANTE_VALID_MONTHS);
    const missingFields = [];
    const missingDocuments = [];
    const documents = {};

    if (!trim(record.get("nombre_completo"))) missingFields.push("nombre_completo");
    if (!trim(record.get("correo"))) missingFields.push("correo");
    if (!trim(record.get("rfc"))) missingFields.push("rfc");
    if (!mainPhone && additionalPhones.length === 0) missingFields.push("telefono");

    const constanciaOmitted = canDocumentBeOmitted("doc_constancia_fiscal") && isDocStateOmitted(docEstados.doc_constancia_fiscal);
    const comprobanteOmitted = canDocumentBeOmitted("doc_comprobante_domicilio") && isDocStateOmitted(docEstados.doc_comprobante_domicilio);
    let allDocsApproved = true;
    let anyDocRejected = false;
    let someDocPending = false;

    for (let i = 0; i < requiredDocFields.length; i += 1) {
      const field = requiredDocFields[i];
      const stateInfo = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
      const omitted = canDocumentBeOmitted(field) && isDocStateOmitted(stateInfo);
      const uploaded = hasValue(record.get(field));
      const fileName = getRecordFileName(record, field);

      let dStat = stateInfo.status ? stateInfo.status : "pendiente";
      let dReason = stateInfo.motivo ? stateInfo.motivo : "";

      if (omitted) {
        dStat = "omitido";
        dReason = "";
      } else if (!uploaded) {
        dStat = "pendiente";
        dReason = "";
      } else {
        if (dStat === "rechazado") anyDocRejected = true;
        else if (dStat === "pendiente") someDocPending = true;
      }
      if (dStat !== "aprobado" && dStat !== "omitido") allDocsApproved = false;

      documents[field] = {
        field,
        label: DOC_LABELS[field],
        uploaded,
        fileName: fileName || "",
        estado: dStat,
        motivo: dReason,
        omitido: omitted,
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
      if (!uploaded && !omitted) missingDocuments.push(field);
    }

    if (!constanciaOmitted && !constanciaUploadDate) missingFields.push("constancia_fiscal_emitida_el");
    if (!comprobanteOmitted && !comprobanteEffectiveDate) missingFields.push("comprobante_domicilio_emitido_el");

    const complete = missingFields.length === 0 && missingDocuments.length === 0;
    const constanciaValid = constanciaOmitted ? true : constanciaInfo.valid;
    const comprobanteValid = comprobanteOmitted ? true : comprobanteInfo.valid;
    const ready = complete && constanciaValid && comprobanteValid && allDocsApproved && !anyDocRejected;
    const dictamenStatus = getClientDictamenStatus(record, tenant);
    const dictamenGuardado = dictamenStatus.saved === true;
    const dictamenAprobado = dictamenStatus.approved === true;
    const readyForContracts = ready && (dictamenAprobado || dictamenGuardado);
    const contractMissingFields = readyForContracts ? [] : missingFields.slice();
    if (ready && !(dictamenAprobado || dictamenGuardado)) contractMissingFields.push("dictamen_aprobado");

    let status = "pendiente_expediente";
    if (readyForContracts) {
      status = "listo_para_contrato";
    } else if (ready) {
      status = "validado";
    } else if (anyDocRejected) {
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
        contractMissingFields,
        maxConstanciaAgeDays: MAX_CONSTANCIA_VALID_DAYS,
        maxComprobanteAgeDays: MAX_COMPROBANTE_VALID_DAYS,
        maxComprobanteAgeMonths: MAX_COMPROBANTE_VALID_MONTHS,
        constanciaFiscalEmitidaEl: constanciaDate || "",
        constanciaFiscalSubidaEl: constanciaUploadDate || "",
        constanciaFiscalVigente: constanciaValid,
        constanciaFiscalReason: constanciaOmitted ? "omitted" : constanciaInfo.reason,
        constanciaFiscalLimiteDesde: constanciaInfo.thresholdDate || "",
        constanciaFiscalDiasAntiguedad: constanciaInfo.ageDays,
        comprobanteDomicilioEmitidoEl: comprobanteDate || comprobanteEffectiveDate || "",
        comprobanteDomicilioSubidoEl: comprobanteEffectiveDate || "",
        comprobanteDomicilioVigente: comprobanteValid,
        comprobanteDomicilioReason: comprobanteOmitted ? "omitted" : comprobanteInfo.reason,
        comprobanteDomicilioLimiteDesde: comprobanteInfo.thresholdDate || "",
        comprobanteDomicilioVigenteHasta: comprobanteInfo.validUntil || "",
        comprobanteDomicilioExpiraEl: comprobanteInfo.expiresAt || "",
        comprobanteDomicilioDiasAntiguedad: comprobanteInfo.ageDays,
        serverDate: formatUtcDate(currentUtcDay()),
        missingFields,
        missingDocuments,
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
      validation: Object.assign({}, validation.data, {
        status: validation.status,
        ready: validation.ready,
        complete: validation.complete
      }),
      quotes: buildPublicClientQuoteSummaries(record),
      profileStatus: validation.status,
      readyForQuotes: validation.ready,
      readyForContracts: validation.data.readyForContracts === true,
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
          "-created",
          100,
          0
        ) || []);
      }
      if (tenant && clientEmail) {
        append($app.findRecordsByFilter(
          "cotizaciones",
          "tenant = '" + tenant + "' && cliente_email = '" + clientEmail + "'",
          "-created",
          100,
          0
        ) || []);
      }
    } catch (_) { }

    return Object.keys(merged)
      .map(function (id) { return merged[id]; })
      .sort(function (a, b) {
        const aTs = Date.parse(trim(a.get("updated")) || trim(a.get("created")) || "") || 0;
        const bTs = Date.parse(trim(b.get("updated")) || trim(b.get("created")) || "") || 0;
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
          flujoEstado: trim(row.get("flujo_estado")).toLowerCase(),
          precioFinal: Number(row.get("precio_final") || 0) || 0,
          numeroContrato: trim(row.get("numero_contrato")),
          documents: {
            cotizacion: !!(getRecordFileName(row, "cotizacion_final_file") || trim(row.get("url_cotizacion_final"))),
            ordenCompra: !!(getRecordFileName(row, "orden_compra_file") || trim(row.get("url_orden_compra"))),
            contrato: !!(getRecordFileName(row, "contrato_file") || trim(row.get("contrato_url"))),
            facturaPdf: !!(getRecordFileName(row, "factura_pdf_file") || trim(row.get("factura_pdf_url"))),
            facturaXml: !!(getRecordFileName(row, "factura_xml_file") || trim(row.get("factura_xml_url"))),
            recibos: payments.length
          }
        };
      });
  }

  function normalizePublicAssetKind(value) {
    const raw = trim(value).toLowerCase();
    if (raw === "cotizacion" || raw === "cotizacion_final") return "cotizacion";
    if (raw === "orden" || raw === "orden_compra") return "orden_compra";
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
        "-created",
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
        "-updated",
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

  function syncClientDocumentMirrors(record) {
    if (!record) return;
    const validation = parseJsonObject(record.get("expediente_validacion"));
    const validationDocs = parseJsonObject(validation.documents);
    const docStates = normalizeDocStateMap(record.get("documentos_estado"));
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      syncClientDocumentMirrorField(record, DOC_FIELDS[i], docStates, validationDocs);
    }
  }

  function buildPublicQuoteDownloadName(quoteRecord, kind, originalName) {
    const labels = {
      cotizacion: "Cotizacion",
      orden_compra: "OrdenCompra",
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
      orden_compra: { fileField: "orden_compra_file", pathField: "url_orden_compra" },
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

  function handleRecordCreateRequest(e) {
    if (!e || !e.record) return e.next();
    e.record.set("nombre_completo", sanitizeText(e.record.get("nombre_completo"), 255));
    e.record.set("correo", sanitizeText(e.record.get("correo"), 255).toLowerCase());
    e.record.set("telefono", normalizePhone(e.record.get("telefono")));
    e.record.set("rfc", sanitizeText(e.record.get("rfc"), 40).toUpperCase());
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
    const originalDocEstados = normalizeDocStateMap(original ? original.get("documentos_estado") : {});
    const incomingDocEstados = normalizeDocStateMap(e.record.get("documentos_estado"));
    const incomingDocStateChanged = JSON.stringify(incomingDocEstados) !== JSON.stringify(originalDocEstados);
    if (incomingDocStateChanged) {
      const isSuperuser = !!(e.hasSuperuserAuth && e.hasSuperuserAuth());
      const authRecord = e.auth || null;
      if (!isSuperuser && !canVerifyClientDocuments(authRecord)) {
        throw new ForbiddenError("Solo un usuario con rango Verificador puede validar documentos.");
      }
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
      for (let i = 0; i < DOC_FIELDS.length; i += 1) {
        const field = DOC_FIELDS[i];
        if (!Object.prototype.hasOwnProperty.call(incomingDocEstados, field)) continue;
        const nextState = incomingDocEstados[field] && typeof incomingDocEstados[field] === "object"
          ? incomingDocEstados[field]
          : {};
        const prevState = originalDocEstados[field] && typeof originalDocEstados[field] === "object"
          ? originalDocEstados[field]
          : {};
        const nextOmitted = normalizeDocDecisionOmitted(nextState);
        const prevOmitted = normalizeDocDecisionOmitted(prevState);
        if (field === "doc_constancia_fiscal" && nextOmitted && !prevOmitted) {
          throw new BadRequestError("La constancia de situacion fiscal no puede marcarse como omitida.");
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
      let docEstadosStr = e.record.get("documentos_estado");
      let docEstados = {};
      if (typeof docEstadosStr === "string" && docEstadosStr.startsWith("{")) {
        try { docEstados = JSON.parse(docEstadosStr); } catch (_) { }
      } else if (docEstadosStr && typeof docEstadosStr === "object") {
        docEstados = docEstadosStr;
      }

      const uploaded = validateUploadedFilesForRequest(e);
      let changed = false;

      for (let i = 0; i < DOC_FIELDS.length; i += 1) {
        const field = DOC_FIELDS[i];
        if (uploaded[field]) {
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
    const docEstados = normalizeDocStateMap(e.record.get("documentos_estado"));
    const filteredStates = {};
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      const state = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
      const approved = normalizeDocDecisionStatus(state) === "aprobado" || (canDocumentBeOmitted(field) && normalizeDocDecisionOmitted(state));
      if (!approved) {
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

    const archiveBytes = toBytes(archiveFile);
    if (archiveFile && typeof archiveFile.close === "function") {
      try { archiveFile.close(); } catch (_) { }
    }
    if (!archiveBytes || !archiveBytes.length) {
      throw new BadRequestError("El archivo ZIP recibido esta vacio.");
    }

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
      throw new InternalServerError(message || "No se pudo proteger el ZIP del expediente.");
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

  function handlePublicClientProfileComplete(e) {
    applyResponseHeaders(e);

    const payload = new DynamicModel({
      access: "",
      accessToken: "",
      additionalPhones: "",
      telefonosAdicionales: "",
      telefonos_adicionales: "",
      additionalEmails: "",
      correosAdicionales: "",
      correos_adicionales: "",
      correo: "",
      email: "",
      rfc: "",
      comprobanteDomicilioEmitidoEl: "",
      comprobante_domicilio_emitido_el: "",
      constanciaFiscalEmitidaEl: "",
      constanciaIssuedAt: "",
      constancia_fiscal_emitida_el: ""
    });
    e.bindBody(payload);

    const access = resolveAuthorizedAccess(payload.access || payload.accessToken);
    const record = access.record;
    const uploadedFiles = validateUploadedFilesForRequest(e);
    const additionalPhones = sanitizePhones(
      payload.additionalPhones || payload.telefonosAdicionales || payload.telefonos_adicionales
    );
    const additionalEmails = sanitizeEmails(
      payload.additionalEmails || payload.correosAdicionales || payload.correos_adicionales
    );
    const requestedEmail = normalizeEmail(payload.correo || payload.email);
    const requestedRfc = sanitizeText(payload.rfc, 40).toUpperCase();
    const docEstados = normalizeDocStateMap(record.get("documentos_estado"));
    const rawConstanciaDate = trim(
      payload.constanciaFiscalEmitidaEl || payload.constanciaIssuedAt || payload.constancia_fiscal_emitida_el
    );
    const rawComprobanteDate = trim(
      payload.comprobanteDomicilioEmitidoEl || payload.comprobante_domicilio_emitido_el
    );
    const hasConstanciaUpload = !!uploadedFiles.doc_constancia_fiscal;
    const hasComprobanteUpload = !!uploadedFiles.doc_comprobante_domicilio;
    const constanciaLockedByAdmin = isDocStateApproved(docEstados.doc_constancia_fiscal);
    const comprobanteLockedByAdmin = isDocStateApprovedOrOmitted(docEstados.doc_comprobante_domicilio);
    let constanciaDate = null;
    let comprobanteDate = null;

    if (rawConstanciaDate || hasConstanciaUpload) {
      constanciaDate = assertValidConstanciaForSubmission(rawConstanciaDate);
    } else if (!constanciaLockedByAdmin && !normalizeDate(record.get("constancia_fiscal_emitida_el"))) {
      constanciaDate = assertValidConstanciaForSubmission(rawConstanciaDate);
    }

    if (rawComprobanteDate || hasComprobanteUpload) {
      comprobanteDate = assertValidComprobanteForSubmission(rawComprobanteDate);
    } else if (!comprobanteLockedByAdmin && !normalizeDate(record.get("comprobante_domicilio_emitido_el"))) {
      comprobanteDate = assertValidComprobanteForSubmission(rawComprobanteDate);
    }

    if (trim(payload.correo || payload.email) && !requestedEmail) {
      throw new BadRequestError("El correo proporcionado no es valido.");
    }

    record.set("telefonos_adicionales", additionalPhones);
    record.set("correos_adicionales", additionalEmails);
    if (requestedEmail) record.set("correo", requestedEmail);
    if (requestedRfc) record.set("rfc", requestedRfc);
    if (constanciaDate !== null) record.set("constancia_fiscal_emitida_el", constanciaDate);
    if (comprobanteDate !== null) record.set("comprobante_domicilio_emitido_el", comprobanteDate);

    const uploadedDocNotifications = [];
    let docEstadosChanged = false;
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      if (uploadedFiles[field]) {
        const currentState = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
        const currentStatus = normalizeDocDecisionStatus(currentState);
        const existingFilePresent = hasValue(record.get(field));
        if (
          (existingFilePresent && currentStatus !== "rechazado") ||
          isDocStateOmitted(currentState)
        ) {
          throw new BadRequestError("El documento " + (DOC_LABELS[field] || field) + " ya fue aprobado o esta en revision.");
        }
        record.set(field, uploadedFiles[field]);
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
    } catch (_) { }
  }

  function handleClientDictamenChanged(e) {
    let clientId = "";
    let dictamenId = "";
    try {
      if (e && e.record) {
        clientId = trim(e.record.get("cliente"));
        dictamenId = sanitizeId(e.record.get("id"));
      }
    } catch (_) { }

    e.next();

    if (!clientId && dictamenId) {
      try {
        const persisted = $app.findRecordById("clientes_dictamenes", dictamenId);
        clientId = trim(persisted.get("cliente"));
      } catch (_) { }
    }
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
    evaluateClientProfileValidation: buildValidation,
    getClientDictamenStatus
  };
})();
