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
  const MAX_COMPROBANTE_VALID_DAYS = 90;
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

  function clientHasSavedDictamen(clientId, tenant) {
    const safeClientId = sanitizeId(clientId);
    const safeTenant = normalizeTenant(tenant);
    if (!safeClientId || !safeTenant) return false;
    try {
      const records = $app.findRecordsByFilter(
        "clientes_dictamenes",
        "cliente = '" + safeClientId + "' && tenant = '" + safeTenant + "'",
        "-created",
        1,
        0
      ) || [];
      for (let i = 0; i < records.length; i += 1) {
        if (hasValue(records[i].get("pdf"))) return true;
      }
    } catch (_) { }
    return false;
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
    const comprobanteInfo = evaluateDocumentDate(comprobanteEffectiveDate, MAX_COMPROBANTE_VALID_DAYS);
    const missingFields = [];
    const missingDocuments = [];
    const documents = {};

    if (!trim(record.get("nombre_completo"))) missingFields.push("nombre_completo");
    if (!trim(record.get("correo"))) missingFields.push("correo");
    if (!trim(record.get("rfc"))) missingFields.push("rfc");
    if (!mainPhone && additionalPhones.length === 0) missingFields.push("telefono");

    const constanciaOmitted = isDocStateOmitted(docEstados.doc_constancia_fiscal);
    const comprobanteOmitted = isDocStateOmitted(docEstados.doc_comprobante_domicilio);
    let allDocsApproved = true;
    let anyDocRejected = false;
    let someDocPending = false;

    for (let i = 0; i < requiredDocFields.length; i += 1) {
      const field = requiredDocFields[i];
      const stateInfo = docEstados[field] && typeof docEstados[field] === "object" ? docEstados[field] : {};
      const omitted = isDocStateOmitted(stateInfo);
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
    const dictamenGuardado = clientHasSavedDictamen(record.get("id"), tenant);
    const readyForContracts = ready && dictamenGuardado;
    const contractMissingFields = readyForContracts ? [] : missingFields.slice();
    if (ready && !dictamenGuardado) contractMissingFields.push("dictamen_aprobado");

    let status = "pendiente_expediente";
    if (ready) {
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
        dictamenAprobado: dictamenGuardado,
        contractMissingFields,
        maxConstanciaAgeDays: MAX_CONSTANCIA_VALID_DAYS,
        maxComprobanteAgeDays: MAX_COMPROBANTE_VALID_DAYS,
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
      profileStatus: validation.status,
      readyForQuotes: validation.ready,
      readyForContracts: validation.data.readyForContracts === true,
      serverDate: validation.data.serverDate,
      accessExpiresAt: trim(meta.expiresAt),
      theme
    };
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
    validateUploadedFilesForRequest(e);
    applyValidationToRecord(e.record, { touchPublicUpdateAt: false });
    return e.next();
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
        const changed = (
          normalizeDocDecisionStatus(nextState) !== normalizeDocDecisionStatus(prevState) ||
          normalizeDocDecisionReason(nextState) !== normalizeDocDecisionReason(prevState) ||
          normalizeDocDecisionOmitted(nextState) !== normalizeDocDecisionOmitted(prevState)
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
      const constanciaWasApproved = isDocStateApprovedOrOmitted(originalDocEstados.doc_constancia_fiscal);
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

    return e.next();
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
      const approved = normalizeDocDecisionStatus(state) === "aprobado" || normalizeDocDecisionOmitted(state);
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
    const constanciaLockedByAdmin = isDocStateApprovedOrOmitted(docEstados.doc_constancia_fiscal);
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
    e.next();
    const clientId = e && e.record ? e.record.get("cliente") : "";
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
    handlePublicClientProfileComplete,
    handleClientDictamenChanged
  };
})();
