(function () {
  const MOVEMENTS_COLLECTION = "control_movimientos";
  const MOVEMENTS_RETENTION_MONTHS = 3;
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
  const DOC_DATE_FIELDS = {
    doc_comprobante_domicilio: "comprobante_domicilio_emitido_el",
    doc_constancia_fiscal: "constancia_fiscal_emitida_el"
  };
  let notificationsApi = null;

  function trim(value) {
    return String(value || "").trim();
  }

  function getNotificationsApi() {
    if (notificationsApi !== null) return notificationsApi;
    try {
      notificationsApi = require(`${__hooks}/notifications_shared.js`) || {};
    } catch (err) {
      notificationsApi = {};
      console.log("[control_movimientos] Notificaciones no disponibles:", String(err));
    }
    return notificationsApi;
  }

  function parseJsonLike(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      const raw = value.trim();
      if (!raw) return "";
      try {
        return JSON.parse(raw);
      } catch (_) {
        return value;
      }
    }
    if (typeof value === "object") {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    }
    return value;
  }

  function safeObject(value) {
    const parsed = parseJsonLike(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function safeArray(value) {
    const parsed = parseJsonLike(value);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") {
      const raw = parsed.trim();
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

  function objectHasKeys(value) {
    try {
      return !!(value && typeof value === "object" && Object.keys(value).length);
    } catch (_) {
      return false;
    }
  }

  function getJsonObject(record, field) {
    if (!record) return {};
    if (typeof record.getString === "function") {
      const fromString = safeObject(record.getString(field));
      if (objectHasKeys(fromString)) return fromString;
    }
    return safeObject(record.get(field));
  }

  function getJsonArray(record, field) {
    if (!record) return [];
    if (typeof record.getString === "function") {
      const fromString = safeArray(record.getString(field));
      if (fromString.length) return fromString;
    }
    return safeArray(record.get(field));
  }

  function normalizeTenant(value) {
    const tenant = trim(value).toLowerCase();
    return (tenant === "plaza_mayor" || tenant === "casa_de_piedra") ? tenant : "";
  }

  function normalizeRole(value) {
    const role = trim(value).toLowerCase();
    if (role === "administrador" || role === "superadmin" || role === "super_admin") return "admin";
    return role || "";
  }

  function sanitizePhone(value) {
    const digits = String(value || "").replace(/\D+/g, "").slice(-10);
    return digits.length === 10 ? digits : "";
  }

  function sanitizeEmail(value) {
    return trim(value).toLowerCase();
  }

  function normalizePhones(value) {
    const source = safeArray(value);
    const seen = {};
    const out = [];
    for (let i = 0; i < source.length; i += 1) {
      const phone = sanitizePhone(source[i]);
      if (!phone || seen[phone]) continue;
      seen[phone] = true;
      out.push(phone);
    }
    return out.sort();
  }

  function normalizeEmails(value) {
    const source = safeArray(value);
    const seen = {};
    const out = [];
    for (let i = 0; i < source.length; i += 1) {
      const email = sanitizeEmail(source[i]);
      if (!email || seen[email]) continue;
      seen[email] = true;
      out.push(email);
    }
    return out.sort();
  }

  function normalizeStatus(value) {
    return trim(value).toLowerCase();
  }

  function normalizeDateValue(value) {
    const raw = trim(value);
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    return raw;
  }

  function isOmitted(state) {
    const current = state && typeof state === "object" ? state : {};
    return current.omitido === true || normalizeStatus(current.status) === "omitido";
  }

  function getFileName(record, field) {
    const raw = record ? record.get(field) : null;
    if (Array.isArray(raw)) return trim(raw[0]);
    return trim(raw);
  }

  function recordValue(record, field) {
    if (!record || !field) return null;
    try {
      return record.get(field);
    } catch (_) {
      return null;
    }
  }

  function getMovementCollection() {
    try {
      return $app.findCollectionByNameOrId(MOVEMENTS_COLLECTION);
    } catch (_) {
      return null;
    }
  }

  function purgeOldMovements() {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - MOVEMENTS_RETENTION_MONTHS);
    const cutoff = cutoffDate.toISOString();
    try {
      while (true) {
        const records = $app.findRecordsByFilter(MOVEMENTS_COLLECTION, `created_at < "${cutoff}"`, "-created_at", 100, 0) || [];
        if (!records.length) break;
        let deleted = 0;
        for (let i = 0; i < records.length; i += 1) {
          try {
            $app.delete(records[i]);
            deleted += 1;
          } catch (err) {
            console.log("[control_movimientos] No se pudo purgar movimiento antiguo:", String(err));
          }
        }
        if (!deleted) break;
      }
    } catch (err) {
      console.log("[control_movimientos] No se pudo ejecutar purga de historico:", String(err));
    }
  }

  function saveMovement(payload) {
    const collection = getMovementCollection();
    if (!collection) return;

    const source = payload && typeof payload === "object" ? payload : {};
    const tenant = normalizeTenant(source.tenant);
    const type = trim(source.tipo_movimiento);
    const entityType = trim(source.entidad_tipo);
    const nowIso = new Date().toISOString();
    if (!tenant || !type || !entityType) return;

    try {
      const record = new Record(collection);
      record.set("tenant", tenant);
      record.set("tipo_movimiento", type);
      record.set("entidad_tipo", entityType);
      record.set("entidad_id", trim(source.entidad_id));
      record.set("entidad_nombre", trim(source.entidad_nombre));
      record.set("cliente_id", trim(source.cliente_id));
      record.set("cliente_nombre", trim(source.cliente_nombre));
      record.set("cotizacion_id", trim(source.cotizacion_id));
      record.set("cotizacion_folio", trim(source.cotizacion_folio));
      record.set("documento_campo", trim(source.documento_campo));
      record.set("documento_nombre", trim(source.documento_nombre));
      record.set("actor_id", trim(source.actor_id));
      record.set("actor_nombre", trim(source.actor_nombre));
      record.set("actor_role", trim(source.actor_role));
      record.set("resumen", trim(source.resumen));
      record.set("metadata", source.metadata && typeof source.metadata === "object" ? source.metadata : {});
      record.set("created_at", nowIso);
      record.set("updated_at", nowIso);
      $app.save(record);
      purgeOldMovements();
    } catch (err) {
      console.log("[control_movimientos] No se pudo guardar movimiento:", String(err));
    }
  }

  function buildActor(e, fallbackName, fallbackRole) {
    const event = e && typeof e === "object" ? e : {};
    const authRecord = event.auth || (event.requestInfo ? event.requestInfo.auth : null) || null;
    if (authRecord) {
      const email = trim(authRecord.getString ? authRecord.getString("email") : authRecord.email);
      const loginUsername = trim(authRecord.getString ? authRecord.getString("login_username") : authRecord.login_username);
      const username = trim(authRecord.getString ? authRecord.getString("username") : authRecord.username);
      const role = normalizeRole(authRecord.getString ? authRecord.getString("role") : authRecord.role);
      return {
        id: trim(authRecord.getString ? authRecord.getString("id") : authRecord.id),
        name: loginUsername || username || (email ? email.split("@")[0] : "") || trim(fallbackName) || "Sistema",
        role: role || normalizeRole(fallbackRole) || "usuario"
      };
    }
    return {
      id: "",
      name: trim(fallbackName) || "Cliente externo",
      role: normalizeRole(fallbackRole) || "externo"
    };
  }

  function buildQuoteFolio(record) {
    const explicit = trim(record && record.getString ? record.getString("numero_orden") : (record ? record.numero_orden : ""));
    if (explicit) return explicit;
    const tenant = normalizeTenant(record && record.getString ? record.getString("tenant") : (record ? record.tenant : ""));
    const prefix = tenant === "casa_de_piedra" ? "CP" : "PM";
    const id = trim(record && record.getString ? record.getString("id") : (record ? record.id : "")).toUpperCase();
    return id ? (prefix + "-" + id.slice(0, 6)) : (prefix + "-PEND");
  }

  function snapshotNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : trim(value);
  }

  function snapshotQuote(record) {
    if (!record) return null;
    return {
      id: trim(record.get("id")),
      tenant: normalizeTenant(record.get("tenant")),
      folio: buildQuoteFolio(record),
      name: trim(record.get("nombre_cotizacion")) || trim(record.get("espacio_nombre")) || "Cotizacion",
      clientId: trim(record.get("cliente_id")),
      clientName: trim(record.get("cliente_nombre")),
      status: normalizeStatus(record.get("status")),
      createdByName: trim(record.get("creado_por_nombre")),
      modifiedByName: trim(record.get("modificado_por_nombre")),
      price: snapshotNumber(record.get("precio_final")),
      adjustmentType: trim(record.get("tipo_ajuste")) || "ninguno",
      adjustmentValue: snapshotNumber(record.get("valor_ajuste")),
      adjustmentIsPercent: record.get("ajuste_es_porcentaje") === true,
      start: trim(record.get("fecha_inicio")),
      end: trim(record.get("fecha_fin"))
    };
  }

  function stableJson(value) {
    const parsed = parseJsonLike(value);
    if (parsed === null || parsed === undefined) return "";
    if (typeof parsed !== "object") return trim(parsed);
    function normalize(item) {
      if (Array.isArray(item)) return item.map(normalize);
      if (item && typeof item === "object") {
        const out = {};
        Object.keys(item).sort().forEach(function (key) {
          out[key] = normalize(item[key]);
        });
        return out;
      }
      return item;
    }
    try {
      return JSON.stringify(normalize(parsed));
    } catch (_) {
      return trim(value);
    }
  }

  function snapshotSpace(record) {
    if (!record) return null;
    const key = trim(recordValue(record, "clave"));
    const name = trim(recordValue(record, "nombre")) || "Espacio";
    return {
      id: trim(recordValue(record, "id")),
      tenant: normalizeTenant(recordValue(record, "tenant")),
      key,
      name,
      label: key ? (key + " - " + name) : name,
      type: trim(recordValue(record, "tipo")),
      description: trim(recordValue(record, "descripcion")),
      basePrice: trim(recordValue(record, "precio_base")),
      adjustmentType: trim(recordValue(record, "ajuste_tipo")),
      adjustmentValue: trim(recordValue(record, "ajuste_porcentaje")),
      active: recordValue(record, "activo") === true || recordValue(record, "activa") === true,
      taxes: stableJson(recordValue(record, "impuestos_ids")),
      tags: stableJson(recordValue(record, "etiquetas")),
      pricesByDay: stableJson(recordValue(record, "precios_por_dia")),
      blockedDays: stableJson(recordValue(record, "dias_bloqueados")),
      blockedPremountDays: stableJson(recordValue(record, "dias_bloqueados_premontaje")),
      b2bConfig: stableJson(recordValue(record, "config_b2b")),
      material: trim(recordValue(record, "material")),
      location: trim(recordValue(record, "ubicacion")),
      width: trim(recordValue(record, "medida_ancho") || recordValue(record, "ancho")),
      height: trim(recordValue(record, "medida_alto") || recordValue(record, "alto")),
      unit: trim(recordValue(record, "medida_unidad") || recordValue(record, "unidad_medida")),
      convenio: recordValue(record, "permite_convenio") === true
    };
  }

  function spaceChangeDetails(before, after) {
    const fields = [
      ["key", "clave"],
      ["name", "nombre"],
      ["type", "tipo"],
      ["description", "descripcion"],
      ["basePrice", "precio base"],
      ["adjustmentType", "tipo de ajuste"],
      ["adjustmentValue", "valor de ajuste"],
      ["active", "visibilidad"],
      ["taxes", "impuestos"],
      ["tags", "etiquetas"],
      ["pricesByDay", "precios por dia"],
      ["blockedDays", "dias bloqueados"],
      ["blockedPremountDays", "dias bloqueados de premontaje"],
      ["b2bConfig", "configuracion B2B"],
      ["material", "material"],
      ["location", "ubicacion"],
      ["width", "ancho"],
      ["height", "alto"],
      ["unit", "unidad de medida"],
      ["convenio", "permite convenio"]
    ];
    const changed = [];
    const beforeMeta = {};
    const afterMeta = {};
    for (let i = 0; i < fields.length; i += 1) {
      const key = fields[i][0];
      const label = fields[i][1];
      const prev = before ? before[key] : undefined;
      const next = after ? after[key] : undefined;
      if (String(prev) === String(next)) continue;
      changed.push(label);
      beforeMeta[key] = prev;
      afterMeta[key] = next;
    }
    return { changed, before: beforeMeta, after: afterMeta };
  }

  function summarizeSpaceChange(before, after, details) {
    const space = after || before || {};
    const label = space.label || "Espacio";
    const changed = details && details.changed ? details.changed : [];
    if (!before && after) return "Espacio " + label + " creado";
    if (before && !after) return "Espacio " + label + " eliminado";
    if (!changed.length) return "Espacio " + label + " actualizado";
    if (changed.length === 1) return "Espacio " + label + " actualizo " + changed[0];
    if (changed.length === 2) return "Espacio " + label + " actualizo " + changed[0] + " y " + changed[1];
    return "Espacio " + label + " actualizo " + changed.slice(0, 2).join(", ") + " y " + (changed.length - 2) + " campo(s) mas";
  }

  function snapshotExistingRecord(collectionName, record, snapshotFn) {
    const id = trim(record ? record.get("id") : "");
    if (!id || typeof snapshotFn !== "function") return null;
    try {
      return snapshotFn($app.findRecordById(collectionName, id));
    } catch (_) {
      return null;
    }
  }

  function hasQuoteNegotiationChange(before, after) {
    if (!before || !after) return false;
    return before.adjustmentType !== after.adjustmentType ||
      before.adjustmentValue !== after.adjustmentValue ||
      before.adjustmentIsPercent !== after.adjustmentIsPercent;
  }

  function summarizeQuoteChange(before, after) {
    if (!before || !after) return "Cotizacion actualizada";
    const negotiationChanged = hasQuoteNegotiationChange(before, after);
    if (negotiationChanged && before.status !== after.status) {
      return "Cotizacion " + after.folio + " modifico precio por negociacion y cambio a " + (after.status || "sin estado");
    }
    if (negotiationChanged) return "Cotizacion " + after.folio + " modifico precio por negociacion";
    if (before.status !== after.status) return "Cotizacion " + after.folio + " cambio a " + (after.status || "sin estado");
    if (before.name !== after.name) return "Cotizacion " + after.folio + " actualizo el nombre";
    if (before.clientName !== after.clientName) return "Cotizacion " + after.folio + " cambio el cliente";
    if (before.price !== after.price) return "Cotizacion " + after.folio + " actualizo el precio final";
    if (before.start !== after.start || before.end !== after.end) return "Cotizacion " + after.folio + " actualizo fechas";
    return "Cotizacion " + after.folio + " modificada";
  }

  function snapshotClient(record) {
    if (!record) return null;
    const states = getJsonObject(record, "documentos_estado");
    const docs = {};
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      const state = safeObject(states[field]);
      docs[field] = {
        file: getFileName(record, field),
        status: isOmitted(state) ? "omitido" : normalizeStatus(state.status || ""),
        omitted: isOmitted(state),
        reason: trim(state.motivo),
        uploadedAt: normalizeDateValue(state.subido_at),
        updatedAt: normalizeDateValue(state.actualizado_at),
        reviewedByName: trim(state.revisado_por_nombre),
        reviewedAt: normalizeDateValue(state.revisado_at),
        approvedByName: trim(state.aprobado_por_nombre),
        approvedAt: normalizeDateValue(state.aprobado_at),
        validityDate: DOC_DATE_FIELDS[field] ? normalizeDateValue(record.get(DOC_DATE_FIELDS[field])) : ""
      };
    }
    return {
      id: trim(record.get("id")),
      tenant: normalizeTenant(record.get("tenant")),
      name: trim(record.get("nombre_completo")) || "Cliente",
      phones: normalizePhones(getJsonArray(record, "telefonos_adicionales")),
      emails: normalizeEmails(getJsonArray(record, "correos_adicionales")),
      docs
    };
  }

  function getDictamenFileName(record) {
    const raw = record ? record.get("pdf") : null;
    if (Array.isArray(raw)) return trim(raw[0]);
    return trim(raw);
  }

  function resolveClientName(clientId, fallback) {
    const direct = trim(fallback);
    if (direct) return direct;
    const id = trim(clientId);
    if (!id) return "";
    try {
      const client = $app.findRecordById("clientes", id);
      return trim(client.get("nombre_completo")) || trim(client.get("correo")) || "";
    } catch (_) {
      return "";
    }
  }

  function dictamenStatus(meta) {
    const source = safeObject(meta);
    const raw = normalizeStatus(source.approval_status || source.status || "");
    if (source.approved === true || raw === "aprobado" || raw === "auto_aprobado") return "aprobado";
    if (source.rejected === true || raw === "rechazado") return "rechazado";
    return raw || "pendiente";
  }

  function snapshotDictamen(record) {
    if (!record) return null;
    const meta = getJsonObject(record, "metadata");
    const clientId = trim(record.get("cliente"));
    const folio = trim(record.get("folio")) || trim(record.get("id")).slice(0, 8) || "Dictamen";
    return {
      id: trim(record.get("id")),
      tenant: normalizeTenant(record.get("tenant")),
      folio,
      clientId,
      clientName: resolveClientName(clientId, meta.cliente_nombre),
      file: getDictamenFileName(record),
      status: dictamenStatus(meta),
      source: trim(meta.source || (meta.generated_by ? "generated" : "")) || "generated",
      generatedAt: trim(meta.generated_at),
      reviewedAt: trim(meta.reviewed_at),
      approvedAt: trim(meta.approved_at)
    };
  }

  function summarizeDictamenChange(before, after) {
    const current = after || before || {};
    const folio = current.folio || "Dictamen";
    const client = current.clientName || "cliente";
    if (!before && after) return "Dictamen " + folio + " creado para " + client;
    if (before && !after) return "Dictamen " + folio + " eliminado de " + client;
    if (before && after && before.status !== after.status) return "Dictamen " + folio + " cambio a " + (after.status || "pendiente");
    return "Dictamen " + folio + " actualizado para " + client;
  }

  function saveDictamenMovement(type, snapshot, actor, summary, metadata) {
    if (!snapshot || !snapshot.tenant) return;
    saveMovement({
      tenant: snapshot.tenant,
      tipo_movimiento: type,
      entidad_tipo: "dictamen",
      entidad_id: snapshot.id,
      entidad_nombre: snapshot.folio,
      cliente_id: snapshot.clientId,
      cliente_nombre: snapshot.clientName,
      documento_campo: "dictamen",
      documento_nombre: "Dictamen",
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: summary,
      metadata: metadata || {}
    });
  }

  function docTransitionType(previousDoc, nextDoc) {
    if (!nextDoc) return "";
    if (nextDoc.omitted) return "documento_omitido";
    if (nextDoc.status === "aprobado") return "documento_aprobado";
    if (nextDoc.status === "rechazado") return "documento_rechazado";
    if (nextDoc.status === "pendiente" && previousDoc && previousDoc.status === "rechazado" && nextDoc.file) return "documento_reenviado";
    if (nextDoc.status === "pendiente" && previousDoc && previousDoc.status && previousDoc.status !== "pendiente" && nextDoc.file) return "documento_pendiente_revision";
    return "";
  }

  function docTransitionSummary(label, clientName, type) {
    if (type === "documento_aprobado") return label + " aprobado para " + clientName;
    if (type === "documento_rechazado") return label + " rechazado para " + clientName;
    if (type === "documento_omitido") return label + " omitido para " + clientName;
    if (type === "documento_reenviado") return label + " reenviado por " + clientName;
    if (type === "documento_pendiente_revision") return label + " marcado en revision para " + clientName;
    return label + " actualizado para " + clientName;
  }

  function actorForDocChange(actor, nextDoc) {
    const base = actor && typeof actor === "object" ? actor : {};
    const currentName = trim(base.name);
    const currentRole = normalizeRole(base.role);
    if (currentName && currentName !== "Cliente externo") {
      return { id: trim(base.id), name: currentName, role: currentRole || "usuario" };
    }

    const doc = nextDoc && typeof nextDoc === "object" ? nextDoc : {};
    const docActorName = trim(doc.approvedByName) || trim(doc.reviewedByName);
    return {
      id: trim(base.id),
      name: docActorName || currentName || "Cliente externo",
      role: currentRole || (docActorName ? "verificador" : "externo")
    };
  }

  function saveDocMovement(after, field, label, type, docActor, summary, metadata) {
    saveMovement({
      tenant: after.tenant,
      tipo_movimiento: type,
      entidad_tipo: "documento",
      entidad_id: after.id + ":" + field,
      entidad_nombre: label,
      cliente_id: after.id,
      cliente_nombre: after.name,
      documento_campo: field,
      documento_nombre: label,
      actor_id: docActor.id,
      actor_nombre: docActor.name,
      actor_role: docActor.role,
      resumen: summary,
      metadata: metadata || {}
    });
  }

  function maybeLogClientDocChanges(before, after, actor) {
    if (!before || !after || !after.tenant) return;
    if (before.id && after.id && before.id !== after.id) return;
    const uploadedDocs = [];
    const approvedDocs = [];
    for (let i = 0; i < DOC_FIELDS.length; i += 1) {
      const field = DOC_FIELDS[i];
      const label = DOC_LABELS[field] || field;
      const previousDoc = before.docs[field] || { file: "", status: "", omitted: false, reason: "", uploadedAt: "", updatedAt: "", reviewedByName: "", reviewedAt: "", approvedByName: "", approvedAt: "", validityDate: "" };
      const nextDoc = after.docs[field] || { file: "", status: "", omitted: false, reason: "", uploadedAt: "", updatedAt: "", reviewedByName: "", reviewedAt: "", approvedByName: "", approvedAt: "", validityDate: "" };
      const docActor = actorForDocChange(actor, nextDoc);

      if (previousDoc.file !== nextDoc.file) {
        let fileMovement = "";
        let summary = "";
        if (!previousDoc.file && nextDoc.file) {
          fileMovement = "documento_subido";
          summary = label + " subido para " + after.name;
        } else if (previousDoc.file && !nextDoc.file) {
          fileMovement = "documento_eliminado";
          summary = label + " eliminado de " + after.name;
        } else if (previousDoc.file && nextDoc.file && previousDoc.file !== nextDoc.file) {
          fileMovement = "documento_reemplazado";
          summary = label + " reemplazado para " + after.name;
        }
        if (fileMovement) {
          saveDocMovement(after, field, label, fileMovement, docActor, summary, {
            archivo_anterior: previousDoc.file,
            archivo_actual: nextDoc.file,
            subido_at_anterior: previousDoc.uploadedAt,
            subido_at_actual: nextDoc.uploadedAt,
            actualizado_at_anterior: previousDoc.updatedAt,
            actualizado_at_actual: nextDoc.updatedAt
          });
          if (fileMovement === "documento_subido" || fileMovement === "documento_reemplazado") {
            uploadedDocs.push({ field, label, type: fileMovement, file: nextDoc.file });
          }
        }
      }

      const uploadMetaChanged = previousDoc.file === nextDoc.file && !!nextDoc.file && (previousDoc.uploadedAt !== nextDoc.uploadedAt || previousDoc.updatedAt !== nextDoc.updatedAt);
      if (uploadMetaChanged) {
        saveDocMovement(after, field, label, "documento_actualizado", docActor, label + " actualizado para " + after.name, {
          archivo: nextDoc.file,
          subido_at_anterior: previousDoc.uploadedAt,
          subido_at_actual: nextDoc.uploadedAt,
          actualizado_at_anterior: previousDoc.updatedAt,
          actualizado_at_actual: nextDoc.updatedAt
        });
      }

      if (previousDoc.validityDate !== nextDoc.validityDate) {
        saveDocMovement(after, field, label, "documento_fecha_actualizada", docActor, "Fecha de " + label + " actualizada para " + after.name, {
          fecha_anterior: previousDoc.validityDate,
          fecha_actual: nextDoc.validityDate
        });
      }

      const stateChanged = previousDoc.status !== nextDoc.status ||
        previousDoc.omitted !== nextDoc.omitted ||
        previousDoc.reason !== nextDoc.reason ||
        previousDoc.reviewedByName !== nextDoc.reviewedByName ||
        previousDoc.reviewedAt !== nextDoc.reviewedAt ||
        previousDoc.approvedByName !== nextDoc.approvedByName ||
        previousDoc.approvedAt !== nextDoc.approvedAt;
      if (stateChanged) {
        const transitionType = docTransitionType(previousDoc, nextDoc) || "documento_estado_actualizado";
        saveDocMovement(after, field, label, transitionType, docActor, docTransitionSummary(label, after.name, transitionType), {
          estado_anterior: previousDoc.status,
          estado_actual: nextDoc.status,
          motivo_anterior: previousDoc.reason,
          motivo_actual: nextDoc.reason,
          revisado_por_anterior: previousDoc.reviewedByName,
          revisado_por_actual: nextDoc.reviewedByName,
          revisado_at_anterior: previousDoc.reviewedAt,
          revisado_at_actual: nextDoc.reviewedAt,
          aprobado_por_anterior: previousDoc.approvedByName,
          aprobado_por_actual: nextDoc.approvedByName,
          aprobado_at_anterior: previousDoc.approvedAt,
          aprobado_at_actual: nextDoc.approvedAt
        });
        if (transitionType === "documento_aprobado") {
          approvedDocs.push({ field, label, type: transitionType, file: nextDoc.file });
        } else if (transitionType === "documento_reenviado" || transitionType === "documento_pendiente_revision") {
          uploadedDocs.push({ field, label, type: transitionType, file: nextDoc.file });
        }
      }
    }

    const notifier = getNotificationsApi();
    if (uploadedDocs.length && typeof notifier.notifyClientDocumentsUploaded === "function") {
      notifier.notifyClientDocumentsUploaded(after, uploadedDocs, actor);
    }
    if (approvedDocs.length && typeof notifier.notifyClientDocumentsApproved === "function") {
      notifier.notifyClientDocumentsApproved(after, approvedDocs, actor);
    }

    if (JSON.stringify(before.phones) !== JSON.stringify(after.phones) || JSON.stringify(before.emails) !== JSON.stringify(after.emails)) {
      saveMovement({
        tenant: after.tenant,
        tipo_movimiento: "cliente_contactos_actualizados",
        entidad_tipo: "cliente",
        entidad_id: after.id,
        entidad_nombre: after.name,
        cliente_id: after.id,
        cliente_nombre: after.name,
        actor_id: actor.id,
        actor_nombre: actor.name,
        actor_role: actor.role,
        resumen: "Contactos de respaldo actualizados para " + after.name,
        metadata: {
          telefonos_anteriores: before.phones,
          telefonos_actuales: after.phones,
          correos_anteriores: before.emails,
          correos_actuales: after.emails
        }
      });
    }
  }

  function handleQuoteCreate(e) {
    const fallbackName = trim(e && e.record ? e.record.get("creado_por_nombre") : "") || trim(e && e.record ? e.record.get("modificado_por_nombre") : "") || "Sistema";
    const actor = buildActor(e, fallbackName, "usuario");
    e.next();

    const quote = snapshotQuote(e.record);
    if (!quote || !quote.tenant) return;
    saveMovement({
      tenant: quote.tenant,
      tipo_movimiento: "cotizacion_creada",
      entidad_tipo: "cotizacion",
      entidad_id: quote.id,
      entidad_nombre: quote.name,
      cliente_id: quote.clientId,
      cliente_nombre: quote.clientName,
      cotizacion_id: quote.id,
      cotizacion_folio: quote.folio,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: "Cotizacion " + quote.folio + " creada para " + (quote.clientName || "cliente sin nombre"),
      metadata: { status: quote.status, fecha_inicio: quote.start, fecha_fin: quote.end, precio_final: quote.price }
    });
  }

  function handleQuoteUpdate(e) {
    const original = e && e.record && typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
    const before = snapshotQuote(original) || snapshotExistingRecord("cotizaciones", e ? e.record : null, snapshotQuote);
    const fallbackName = trim(e && e.record ? e.record.get("modificado_por_nombre") : "") || trim(e && e.record ? e.record.get("creado_por_nombre") : "") || "Sistema";
    const actor = buildActor(e, fallbackName, "usuario");
    e.next();

    const after = snapshotQuote(e.record);
    if (!after || !after.tenant) return;
    const movementType = hasQuoteNegotiationChange(before, after) ? "modificacion_precio" : "cotizacion_actualizada";
    saveMovement({
      tenant: after.tenant,
      tipo_movimiento: movementType,
      entidad_tipo: "cotizacion",
      entidad_id: after.id,
      entidad_nombre: after.name,
      cliente_id: after.clientId,
      cliente_nombre: after.clientName,
      cotizacion_id: after.id,
      cotizacion_folio: after.folio,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: summarizeQuoteChange(before, after),
      metadata: { antes: before, despues: after, negociacion_precio: movementType === "modificacion_precio" }
    });
    if (before && before.status !== after.status) {
      const notifier = getNotificationsApi();
      if (typeof notifier.notifyQuoteStatusChanged === "function") {
        notifier.notifyQuoteStatusChanged(before, after, actor);
      }
    }
  }

  function handleQuoteDelete(e) {
    const quote = snapshotQuote(e.record);
    const fallbackName = (quote ? quote.modifiedByName : "") || (quote ? quote.createdByName : "") || "Sistema";
    const actor = buildActor(e, fallbackName, "usuario");
    e.next();

    if (!quote || !quote.tenant) return;
    saveMovement({
      tenant: quote.tenant,
      tipo_movimiento: "cotizacion_eliminada",
      entidad_tipo: "cotizacion",
      entidad_id: quote.id,
      entidad_nombre: quote.name,
      cliente_id: quote.clientId,
      cliente_nombre: quote.clientName,
      cotizacion_id: quote.id,
      cotizacion_folio: quote.folio,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: "Cotizacion " + quote.folio + " eliminada",
      metadata: { snapshot: quote }
    });
  }

  function handleSpaceCreate(e) {
    const actor = buildActor(e, "Sistema", "usuario");
    e.next();

    const space = snapshotSpace(e.record);
    if (!space || !space.tenant) return;
    saveMovement({
      tenant: space.tenant,
      tipo_movimiento: "espacio_creado",
      entidad_tipo: "espacio",
      entidad_id: space.id,
      entidad_nombre: space.label,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: summarizeSpaceChange(null, space, null),
      metadata: { despues: space }
    });
  }

  function handleSpaceUpdate(e) {
    const original = e && e.record && typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
    const before = snapshotSpace(original) || snapshotExistingRecord("espacios", e ? e.record : null, snapshotSpace);
    const actor = buildActor(e, "Sistema", "usuario");
    e.next();

    const after = snapshotSpace(e.record);
    if (!after || !after.tenant) return;
    const details = spaceChangeDetails(before, after);
    if (!details.changed.length) return;
    saveMovement({
      tenant: after.tenant,
      tipo_movimiento: "espacio_actualizado",
      entidad_tipo: "espacio",
      entidad_id: after.id,
      entidad_nombre: after.label,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: summarizeSpaceChange(before, after, details),
      metadata: {
        campos_modificados: details.changed,
        antes: details.before,
        despues: details.after,
        snapshot_anterior: before,
        snapshot_actual: after
      }
    });
  }

  function handleSpaceDelete(e) {
    const space = snapshotSpace(e.record);
    const actor = buildActor(e, "Sistema", "usuario");
    e.next();

    if (!space || !space.tenant) return;
    saveMovement({
      tenant: space.tenant,
      tipo_movimiento: "espacio_eliminado",
      entidad_tipo: "espacio",
      entidad_id: space.id,
      entidad_nombre: space.label,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: summarizeSpaceChange(space, null, null),
      metadata: { snapshot: space }
    });
  }

  function handleClientCreate(e) {
    const tenant = normalizeTenant(e && e.record ? e.record.get("tenant") : "");
    if (!tenant) {
      e.next();
      return;
    }

    const clientName = trim(e.record.get("nombre_completo")) || "Cliente";
    const actor = buildActor(e, clientName, "usuario");
    e.next();
    const clientId = trim(e.record.get("id"));
    const profileOrigin = trim(recordValue(e.record, "perfil_origen")).toLowerCase();
    const isQuickProfile = profileOrigin === "cotizacion_rapida";

    saveMovement({
      tenant,
      tipo_movimiento: isQuickProfile ? "perfil_rapido_creado" : "cliente_creado",
      entidad_tipo: "cliente",
      entidad_id: clientId,
      entidad_nombre: clientName,
      cliente_id: clientId,
      cliente_nombre: clientName,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: isQuickProfile
        ? "Perfil rapido creado desde cotizacion rapida para " + clientName
        : "Cliente " + clientName + " creado",
      metadata: {
        perfil_origen: profileOrigin || "manual",
        perfil_estatus: trim(recordValue(e.record, "perfil_estatus"))
      }
    });
  }

  function handleClientUpdate(e) {
    const original = e && e.record && typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
    const before = snapshotClient(original) || snapshotExistingRecord("clientes", e ? e.record : null, snapshotClient);
    const fallbackName = trim(e && e.record ? e.record.get("nombre_completo") : "") || "Cliente externo";
    const actor = buildActor(e, fallbackName, e && e.auth ? "usuario" : "externo");
    e.next();

    const after = snapshotClient(e.record);
    maybeLogClientDocChanges(before, after, actor);
  }

  function handleClientDelete(e) {
    const client = snapshotClient(e.record);
    const actor = buildActor(e, client ? client.name : "Cliente", "usuario");
    e.next();

    if (!client || !client.tenant) return;
    saveMovement({
      tenant: client.tenant,
      tipo_movimiento: "cliente_eliminado",
      entidad_tipo: "cliente",
      entidad_id: client.id,
      entidad_nombre: client.name,
      cliente_id: client.id,
      cliente_nombre: client.name,
      actor_id: actor.id,
      actor_nombre: actor.name,
      actor_role: actor.role,
      resumen: "Cliente " + client.name + " eliminado",
      metadata: { snapshot: client }
    });
  }

  function handleDictamenCreate(e) {
    const actor = buildActor(e, trim(e && e.record ? e.record.get("responsable_nombre") : "") || "Sistema", "verificador");
    e.next();

    const after = snapshotDictamen(e.record);
    saveDictamenMovement("dictamen_creado", after, actor, summarizeDictamenChange(null, after), { despues: after });
  }

  function handleDictamenUpdate(e) {
    const original = e && e.record && typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
    const before = snapshotDictamen(original) || snapshotExistingRecord("clientes_dictamenes", e ? e.record : null, snapshotDictamen);
    const actor = buildActor(e, trim(e && e.record ? e.record.get("responsable_nombre") : "") || "Sistema", "verificador");
    e.next();

    const after = snapshotDictamen(e.record);
    if (before && after && JSON.stringify(before) === JSON.stringify(after)) return;
    saveDictamenMovement("dictamen_actualizado", after, actor, summarizeDictamenChange(before, after), { antes: before, despues: after });
  }

  function handleDictamenDelete(e) {
    const before = snapshotDictamen(e.record);
    const actor = buildActor(e, before ? before.clientName : "Sistema", "verificador");
    e.next();

    saveDictamenMovement("dictamen_eliminado", before, actor, summarizeDictamenChange(before, null), { snapshot: before });
  }

  module.exports = {
    handleQuoteCreate,
    handleQuoteUpdate,
    handleQuoteDelete,
    handleSpaceCreate,
    handleSpaceUpdate,
    handleSpaceDelete,
    handleClientCreate,
    handleClientUpdate,
    handleClientDelete,
    handleDictamenCreate,
    handleDictamenUpdate,
    handleDictamenDelete
  };
})();
