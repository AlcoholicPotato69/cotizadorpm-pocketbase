/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  const DOC_FIELDS = [
    "doc_acta_constitutiva",
    "doc_ine",
    "doc_comprobante_domicilio",
    "doc_constancia_fiscal"
  ];
  const DOC_LABELS = {
    doc_acta_constitutiva: "Acta constitutiva",
    doc_ine: "INE",
    doc_comprobante_domicilio: "Comprobante de domicilio",
    doc_constancia_fiscal: "Constancia de situacion fiscal"
  };
  const MAX_CONSTANCIA_AGE_DAYS = 92;
  const TOKEN_INDEX = "CREATE INDEX idx_clientes_perfil_publico_token ON clientes (perfil_publico_token)";

  const getField = (name) => {
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  const trim = (value) => String(value || "").trim();

  const normalizePhone = (value) => {
    const digits = String(value || "").replace(/\D+/g, "").slice(-10);
    return digits.length === 10 ? digits : "";
  };

  const normalizeDate = (value) => {
    const raw = trim(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) return raw.slice(0, 10);
    return "";
  };

  const safeArray = (value) => {
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
  };

  const sanitizePhones = (value) => {
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
  };

  const hasValue = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return trim(value) !== "";
  };

  const randomToken = () => {
    let token = "";
    while (token.length < 48) {
      token += Math.random().toString(36).slice(2);
    }
    return token.slice(0, 48);
  };

  const dayDiffFromToday = (dateString) => {
    const normalized = normalizeDate(dateString);
    if (!normalized) return Number.POSITIVE_INFINITY;
    const current = new Date();
    const today = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
    const target = new Date(normalized + "T00:00:00Z");
    if (isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
    return Math.floor((today.getTime() - target.getTime()) / 86400000);
  };

  const buildValidation = (record) => {
    const additionalPhones = sanitizePhones(record.get("telefonos_adicionales"));
    const mainPhone = normalizePhone(record.get("telefono"));
    const constanciaDate = normalizeDate(record.get("constancia_fiscal_emitida_el"));
    const missingFields = [];
    const missingDocuments = [];
    const documents = {};

    if (!trim(record.get("nombre_completo"))) missingFields.push("nombre_completo");
    if (!trim(record.get("correo"))) missingFields.push("correo");
    if (!trim(record.get("rfc"))) missingFields.push("rfc");
    if (!mainPhone && additionalPhones.length === 0) missingFields.push("telefono");

    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      const fileValue = record.get(field);
      const fileName = Array.isArray(fileValue) ? trim(fileValue[0]) : trim(fileValue);
      const uploaded = hasValue(fileValue);
      documents[field] = {
        field,
        label: DOC_LABELS[field],
        uploaded,
        fileName: fileName || ""
      };
      if (!uploaded) missingDocuments.push(field);
    }

    const constanciaAgeDays = dayDiffFromToday(constanciaDate);
    const constanciaFresh = !!constanciaDate && constanciaAgeDays >= 0 && constanciaAgeDays <= MAX_CONSTANCIA_AGE_DAYS;
    if (!constanciaDate) missingFields.push("constancia_fiscal_emitida_el");

    const complete = missingFields.length === 0 && missingDocuments.length === 0;
    const ready = complete && constanciaFresh;
    const status = ready
      ? "validado"
      : (complete ? "constancia_vencida" : "pendiente_expediente");

    return {
      status,
      ready,
      complete,
      data: {
        checkedAt: new Date().toISOString(),
        readyForQuotes: ready,
        isComplete: complete,
        maxConstanciaAgeDays: MAX_CONSTANCIA_AGE_DAYS,
        constanciaFiscalEmitidaEl: constanciaDate || "",
        constanciaFiscalVigente: constanciaFresh,
        missingFields,
        missingDocuments,
        additionalPhoneCount: additionalPhones.length,
        documents
      }
    };
  };

  const ensureTextField = (name, max, options = {}) => {
    let field = getField(name);
    if (!field) {
      field = new TextField({
        name,
        required: options.required === true,
        max: max || 255
      });
      collection.fields.add(field);
    }
    if (field && String(field.type || "").toLowerCase() === "text") {
      field.required = options.required === true;
      field.max = max || 255;
    }
  };

  const ensureBoolField = (name) => {
    let field = getField(name);
    if (!field) {
      field = new BoolField({ name });
      collection.fields.add(field);
    }
  };

  const ensureJsonField = (name) => {
    let field = getField(name);
    if (!field) {
      field = new JSONField({
        name,
        required: false
      });
      collection.fields.add(field);
    }
    if (field && String(field.type || "").toLowerCase() === "json") {
      field.required = false;
    }
  };

  const ensureFileField = (name) => {
    let field = getField(name);
    if (!field) {
      field = new FileField({
        name,
        maxSelect: 1,
        maxSize: 15728640,
        protected: true,
        mimeTypes: [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp"
        ]
      });
      collection.fields.add(field);
    }
    if (field && String(field.type || "").toLowerCase() === "file") {
      field.maxSelect = 1;
      field.maxSize = 15728640;
      field.protected = true;
      field.mimeTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp"
      ];
    }
  };

  ensureJsonField("telefonos_adicionales");
  ensureTextField("constancia_fiscal_emitida_el", 10);
  ensureFileField("doc_acta_constitutiva");
  ensureFileField("doc_ine");
  ensureFileField("doc_comprobante_domicilio");
  ensureFileField("doc_constancia_fiscal");
  ensureTextField("perfil_publico_token", 80);
  ensureTextField("perfil_estatus", 40);
  ensureBoolField("perfil_validado");
  ensureBoolField("perfil_completo");
  ensureJsonField("expediente_validacion");
  ensureTextField("perfil_publico_actualizado_at", 40);
  ensureTextField("expediente_validado_at", 40);

  const indexes = Array.isArray(collection.indexes) ? [...collection.indexes] : [];
  if (!indexes.includes(TOKEN_INDEX)) indexes.push(TOKEN_INDEX);
  collection.indexes = indexes;
  app.save(collection);

  const allRecords = app.findAllRecords(collection) || [];
  for (let i = 0; i < allRecords.length; i += 1) {
    const record = allRecords[i];
    record.set("telefonos_adicionales", sanitizePhones(record.get("telefonos_adicionales")));
    record.set("constancia_fiscal_emitida_el", normalizeDate(record.get("constancia_fiscal_emitida_el")));
    if (!trim(record.get("perfil_publico_token"))) {
      record.set("perfil_publico_token", randomToken());
    }

    const validation = buildValidation(record);
    record.set("perfil_estatus", validation.status);
    record.set("perfil_validado", validation.ready);
    record.set("perfil_completo", validation.complete);
    record.set("expediente_validacion", validation.data);
    record.set(
      "expediente_validado_at",
      validation.ready ? (trim(record.get("expediente_validado_at")) || new Date().toISOString()) : ""
    );

    app.save(record);
  }
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  [
    "telefonos_adicionales",
    "constancia_fiscal_emitida_el",
    "doc_acta_constitutiva",
    "doc_ine",
    "doc_comprobante_domicilio",
    "doc_constancia_fiscal",
    "perfil_publico_token",
    "perfil_estatus",
    "perfil_validado",
    "perfil_completo",
    "expediente_validacion",
    "perfil_publico_actualizado_at",
    "expediente_validado_at"
  ].forEach((name) => {
    try {
      collection.fields.removeByName(name);
    } catch (_) {}
  });

  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((value) => String(value || "").indexOf("idx_clientes_perfil_publico_token") === -1);

  app.save(collection);
});
