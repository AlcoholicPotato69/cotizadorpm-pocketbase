/**
 * =============================================================================
 * 10_cotizaciones.pb.js — Hooks de la Colección "cotizaciones"
 * =============================================================================
 * Propósito: Controla la creación y visualización de cotizaciones.
 *
 * Hooks registrados:
 * - onRecordCreateRequest: Validación y sanitización para creaciones públicas.
 * - onRecordUpdateRequest: Control de acceso para actualizaciones.
 * - onRecordEnrich: Oculta campos sensibles en respuestas públicas (sin auth).
 *
 * Seguridad:
 * - Las solicitudes públicas (sin auth) solo pueden crear con status "pendiente".
 * - Campos de texto se sanitizan (strip HTML tags, long max).
 * - Email y teléfono se validan con regex.
 * - Campos financieros y de documentos se fuerzan vacíos en creaciones públicas.
 * =============================================================================
 */
(function () {
  /**
   * Elimina todas las etiquetas HTML de un string.
   * @param {string} v - Texto que puede contener HTML
   * @returns {string} Texto sin tags HTML
   */
  function stripTags(v) {
    return String(v || "").replace(/<[^>]*>/g, "");
  }

  /**
   * Sanitiza un campo de texto: elimina HTML, caracteres de control, y aplica largo máximo.
   * @param {string} v - Texto a sanitizar
   * @param {number} maxLen - Longitud máxima permitida
   * @returns {string} Texto sanitizado
   */
  function sanitizeText(v, maxLen) {
    var text = stripTags(String(v || "")).trim();
    // Elimina caracteres de control ASCII (excepto tab, LF, CR)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    if (maxLen && text.length > maxLen) text = text.slice(0, maxLen);
    return text;
  }

  function safeArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        var parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  function safeObject(v) {
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        var parsed = JSON.parse(v);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {
        return {};
      }
    }
    return {};
  }

  function sanitizeDate(v) {
    var text = String(v || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text)) return text.slice(0, 10);
    return "";
  }

  function clampInt(v, min, max) {
    var num = parseInt(v, 10);
    if (isNaN(num)) num = 0;
    if (typeof min === "number" && num < min) num = min;
    if (typeof max === "number" && num > max) num = max;
    return num;
  }

  function uniqueSortedDates(list) {
    var map = {};
    var out = [];
    var values = safeArray(list);
    for (var i = 0; i < values.length; i += 1) {
      var ds = sanitizeDate(values[i]);
      if (!ds || map[ds]) continue;
      map[ds] = true;
      out.push(ds);
    }
    out.sort();
    return out;
  }

  function diffDays(start, end) {
    var a = sanitizeDate(start);
    var b = sanitizeDate(end);
    if (!a || !b) return -1;
    var startDate = new Date(a + "T00:00:00Z");
    var endDate = new Date(b + "T00:00:00Z");
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return -1;
    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  }

  function sanitizeSpaceDetail(raw, tenant) {
    var detail = safeObject(raw);
    var start = sanitizeDate(detail.fecha_inicio);
    var end = sanitizeDate(detail.fecha_fin || detail.fecha_inicio);
    if (!start || !end || diffDays(start, end) < 0 || diffDays(start, end) > 366) return null;

    var premDates = uniqueSortedDates(detail.premontaje_fechas).slice(0, 31);
    var horario = safeObject(detail.horario);
    var normalized = {
      espacio_id: sanitizeText(detail.espacio_id || detail.space_id, 80),
      espacio_nombre: sanitizeText(detail.espacio_nombre, 200),
      espacio_clave: sanitizeText(detail.espacio_clave || detail.space_key, 80),
      fecha_inicio: start,
      fecha_fin: end,
      personas: clampInt(detail.personas, 0, 100000),
      horario: {
        label: sanitizeText(horario.label || detail.horario_label, 120)
      },
      premontaje_dias: clampInt(detail.premontaje_dias, 0, 31),
      premontaje_fechas: premDates,
      horas_extra: clampInt(detail.horas_extra, 0, 48)
    };

    if (!normalized.espacio_id) return null;
    if (tenant === "casa_de_piedra") {
      normalized.premontaje_dias = Math.min(normalized.premontaje_dias, premDates.length || normalized.premontaje_dias);
    } else {
      normalized.premontaje_dias = 0;
      normalized.premontaje_fechas = [];
      normalized.horas_extra = 0;
    }
    return normalized;
  }

  function sanitizeEventDetails(raw, fallbackName, spaceCount) {
    var data = safeObject(raw);
    return {
      multi_espacio: !!data.multi_espacio || clampInt(data.total_espacios, 0, 99) > 1 || spaceCount > 1,
      total_espacios: clampInt(data.total_espacios || spaceCount, 0, 99),
      nombre_cotizacion: sanitizeText(data.nombre_cotizacion || fallbackName, 300)
    };
  }

  function clearSensitivePublicFields(record) {
    record.set("datos_fiscales", {});
    record.set("historial_pagos", []);
    record.set("datos_factura", {});
    record.set("cliente_id", "");
    record.set("cliente_rfc", "");
    record.set("notas_pdf", []);
    record.set("numero_orden", "");
    record.set("numero_contrato", "");
    record.set("factura_pdf_url", "");
    record.set("factura_xml_url", "");
    record.set("contrato_url", "");
    record.set("url_cotizacion_final", "");
    record.set("url_orden_compra", "");
    record.set("factura_pdf_file", []);
    record.set("factura_xml_file", []);
    record.set("contrato_file", []);
    record.set("cotizacion_final_file", []);
    record.set("orden_compra_file", []);
  }

  function normalizePhone(v) {
    var digits = String(v || "").replace(/\D+/g, "").slice(-10);
    return digits.length === 10 ? digits : "";
  }

  function normalizeEmail(v) {
    var value = sanitizeText(v, 255).toLowerCase();
    if (!value) return "";
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(value) ? value : "";
  }

  function parseMoney(value) {
    if (typeof value === "number") return isNaN(value) ? NaN : value;
    if (typeof value === "string") {
      var raw = value.replace(/,/g, "").trim();
      if (!raw) return NaN;
      var parsed = parseFloat(raw);
      return isNaN(parsed) ? NaN : parsed;
    }
    if (value === null || value === undefined) return NaN;
    var numeric = parseFloat(String(value || "").replace(/,/g, "").trim());
    return isNaN(numeric) ? NaN : numeric;
  }

  function safeMoney(value, fallback) {
    var parsed = parseMoney(value);
    if (!isNaN(parsed) && isFinite(parsed)) return parsed;
    return typeof fallback === "number" ? fallback : 0;
  }

  function hasRecordValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    if (value && typeof value === "object") return true;
    return sanitizeText(value, 500) !== "";
  }

  function loadClientRecord(clientId) {
    var safeId = sanitizeText(clientId, 64).replace(/[^a-zA-Z0-9]/g, "");
    if (!safeId) return null;
    try {
      return $app.findRecordById("clientes", safeId);
    } catch (_) {
      return null;
    }
  }

  function syncQuoteClientSnapshot(record) {
    var clientRecord = loadClientRecord(record.getString("cliente_id"));
    if (!clientRecord) return;

    var tenant = sanitizeText(record.getString("tenant"), 40).toLowerCase();
    var clientTenant = sanitizeText(clientRecord.getString("tenant"), 40).toLowerCase();
    if (tenant && clientTenant && tenant !== clientTenant) {
      throw new BadRequestError("El perfil del cliente no pertenece al tenant de esta cotización.");
    }

    var clientName = sanitizeText(clientRecord.getString("nombre_completo"), 255);
    var clientRfc = sanitizeText(clientRecord.getString("rfc"), 40).toUpperCase();
    var clientPhone = normalizePhone(clientRecord.getString("telefono"));
    var clientEmail = normalizeEmail(clientRecord.getString("correo"));

    if (clientName) record.set("cliente_nombre", clientName);
    if (clientRfc) record.set("cliente_rfc", clientRfc);
    if (clientPhone) {
      record.set("cliente_telefono", clientPhone);
      if (!sanitizeText(record.getString("cliente_contacto"), 80)) {
        record.set("cliente_contacto", clientPhone);
      }
    }
    if (clientEmail) record.set("cliente_email", clientEmail);

    var datosFiscales = safeObject(record.get("datos_fiscales"));
    if (clientRfc) datosFiscales.rfc_receptor = clientRfc;
    if (clientName) datosFiscales.razon_social_receptor = clientName;
    if (clientEmail) datosFiscales.correo_receptor = clientEmail;
    record.set("datos_fiscales", datosFiscales);
  }

  function clientHasSavedDictamen(clientId, tenant) {
    var safeId = sanitizeText(clientId, 64).replace(/[^a-zA-Z0-9]/g, "");
    var safeTenant = sanitizeText(tenant, 40).toLowerCase();
    if (!safeId || (safeTenant !== "plaza_mayor" && safeTenant !== "casa_de_piedra")) return false;
    try {
      var records = $app.findRecordsByFilter(
        "clientes_dictamenes",
        "cliente = '" + safeId + "' && tenant = '" + safeTenant + "'",
        "-created",
        1,
        0
      ) || [];
      for (var i = 0; i < records.length; i += 1) {
        if (hasRecordValue(records[i].get("pdf"))) return true;
      }
    } catch (_) { }
    return false;
  }

  function ensureClientReadyForContract(record) {
    var clientId = sanitizeText(record.getString("cliente_id"), 64).replace(/[^a-zA-Z0-9]/g, "");
    if (!clientId) {
      throw new BadRequestError("Para generar contrato debes seleccionar un perfil de cliente validado.");
    }
    var clientRecord = loadClientRecord(clientId);
    if (!clientRecord) {
      throw new BadRequestError("No se encontro el perfil de cliente asociado al contrato.");
    }
    var tenant = sanitizeText(record.getString("tenant"), 40).toLowerCase();
    var clientTenant = sanitizeText(clientRecord.getString("tenant"), 40).toLowerCase();
    if (tenant && clientTenant && tenant !== clientTenant) {
      throw new BadRequestError("El perfil del cliente no pertenece al tenant de esta cotización.");
    }
    var validation = safeObject(clientRecord.get("expediente_validacion"));
    var readyForQuotes =
      isTruthyReadyFlag(clientRecord.get("perfil_validado")) ||
      isTruthyReadyFlag(validation.readyForQuotes) ||
      isTruthyReadyFlag(validation.ready) ||
      isTruthyReadyFlag(validation.puedeCotizar) ||
      isTruthyReadyFlag(validation.quoteApproved) ||
      isTruthyReadyFlag(validation.quoteReady) ||
      isTruthyReadyFlag(validation.readyForContracts) ||
      isReadyStatusValue(clientRecord.getString("perfil_estatus")) ||
      isReadyStatusValue(validation.status);
    if (!readyForQuotes) {
      throw new BadRequestError("El expediente del cliente debe estar completo, vigente y aprobado antes de generar contrato.");
    }
    if (!clientHasSavedDictamen(clientId, clientTenant || tenant)) {
      throw new BadRequestError("Para generar contrato necesitas un dictamen aprobado o guardado del cliente.");
    }
  }

  function comparableValue(record, field) {
    if (!record) return "";
    var value = record.get(field);
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean));
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value || "");
  }

  function contractFieldsTouched(record, original) {
    var fields = ["numero_contrato", "contrato_url", "contrato_file"];
    for (var i = 0; i < fields.length; i += 1) {
      var field = fields[i];
      if (!hasRecordValue(record.get(field))) continue;
      if (!original || comparableValue(record, field) !== comparableValue(original, field)) return true;
    }
    return false;
  }

  function isTruthyReadyFlag(value) {
    if (value === true || value === 1) return true;
    var normalized = sanitizeText(value, 40).toLowerCase();
    return normalized === "true" ||
      normalized === "1" ||
      normalized === "si" ||
      normalized === "yes" ||
      normalized === "aprobado" ||
      normalized === "aprobada" ||
      normalized === "validado" ||
      normalized === "validada" ||
      normalized === "listo" ||
      normalized === "lista";
  }

  function isReadyStatusValue(value) {
    var normalized = sanitizeText(value, 80).toLowerCase();
    return normalized === "validado" ||
      normalized === "validada" ||
      normalized === "aprobado" ||
      normalized === "aprobada" ||
      normalized === "listo" ||
      normalized === "lista" ||
      normalized === "listo_para_cotizar" ||
      normalized === "lista_para_cotizar";
  }

  function normalizeDiscountType(value) {
    var raw = sanitizeText(value, 40).toLowerCase();
    if (raw === "descuento" || raw === "discount") return "descuento";
    if (raw === "porcentaje" || raw === "percent" || raw === "percentage") return "porcentaje";
    if (raw === "monto_fijo" || raw === "fixed" || raw === "fijo") return "monto_fijo";
    return raw || "ninguno";
  }

  function getQuoteDiscountBase(record) {
    var breakdown = safeObject(record.get("desglose_precios"));
    var candidates = [
      breakdown.subtotal_antes_impuestos,
      breakdown.auto_calculado,
      breakdown.precio_final_usado,
      record.get("precio_final")
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var value = safeMoney(candidates[i], -1);
      if (value > 0) return value;
    }
    return 0;
  }

  function enforceQuoteDiscountLimit(record) {
    var maxPercent = 10;
    var base = getQuoteDiscountBase(record);
    var maxFixed = base * (maxPercent / 100);
    var totalFixedDiscount = 0;
    var topType = normalizeDiscountType(record.getString("tipo_ajuste"));
    var topValue = Math.max(0, safeMoney(record.get("valor_ajuste"), 0));
    if (topType === "descuento" && topValue > 0) {
      if (record.get("ajuste_es_porcentaje") === true) {
        if (topValue > maxPercent) {
          throw new BadRequestError("El descuento maximo permitido es 10%.");
        }
        totalFixedDiscount += base * (topValue / 100);
      } else {
        totalFixedDiscount += topValue;
      }
    }

    var concepts = safeArray(record.get("conceptos_adicionales"));
    for (var i = 0; i < concepts.length; i += 1) {
      var concept = safeObject(concepts[i]);
      var conceptType = normalizeDiscountType(concept.type || concept.tipo || concept.kind);
      if (conceptType !== "descuento") continue;
      var amount = Math.max(0, safeMoney(concept.amount !== undefined ? concept.amount : concept.value, 0));
      var unit = normalizeDiscountType(concept.unit || concept.unidad || "");
      if (unit === "porcentaje") {
        if (amount > maxPercent) {
          throw new BadRequestError("El descuento maximo permitido es 10%.");
        }
        totalFixedDiscount += base * (amount / 100);
      } else {
        totalFixedDiscount += amount;
      }
    }

    if (base <= 0 && totalFixedDiscount > 0.01) {
      throw new BadRequestError("No se puede aplicar descuento sin una base de cotización válida.");
    }
    if (base > 0 && totalFixedDiscount > maxFixed + 0.01) {
      throw new BadRequestError("El descuento total no puede superar el 10% de la cotización.");
    }
  }

  function getPublicThrottleStore() {
    if (!globalThis.__COTIZADOR_PUBLIC_QUOTE_THROTTLE__) {
      globalThis.__COTIZADOR_PUBLIC_QUOTE_THROTTLE__ = {};
    }
    return globalThis.__COTIZADOR_PUBLIC_QUOTE_THROTTLE__;
  }

  function enforcePublicThrottle(tenant, email, phone, quoteName) {
    var now = Date.now();
    var windowMs = 10 * 60 * 1000;
    var duplicateWindowMs = 45 * 1000;
    var maxCreatesPerWindow = 4;
    // SEGURIDAD: La clave no incluye quoteName para evitar falsos positivos
    // entre usuarios distintos que soliciten el mismo espacio con el mismo nombre.
    // NOTA: Este throttle es in-memory y se resetea al reiniciar PocketBase.
    // Para producción con alta carga, considerar un throttle persistente en BD.
    var key = [
      String(tenant || "").trim().toLowerCase(),
      String(email || "").trim().toLowerCase(),
      String(phone || "").replace(/\D+/g, "")
    ].join("|");
    var store = getPublicThrottleStore();
    var recent = Array.isArray(store[key]) ? store[key] : [];
    recent = recent.filter(function (ts) {
      return typeof ts === "number" && (now - ts) < windowMs;
    });
    if (recent.length && (now - recent[recent.length - 1]) < duplicateWindowMs) {
      throw new BadRequestError("La solicitud ya fue recibida. Espera un momento antes de intentarlo de nuevo.");
    }
    if (recent.length >= maxCreatesPerWindow) {
      throw new BadRequestError("Se alcanzó el límite temporal de solicitudes. Intenta nuevamente más tarde.");
    }
    recent.push(now);
    store[key] = recent;
  }

  globalThis.__COTIZADOR_PUBLIC_QUOTE_HELPERS__ = {
    sanitizeText: sanitizeText,
    safeArray: safeArray,
    sanitizeDate: sanitizeDate,
    clampInt: clampInt,
    diffDays: diffDays,
    sanitizeSpaceDetail: sanitizeSpaceDetail,
    sanitizeEventDetails: sanitizeEventDetails,
    clearSensitivePublicFields: clearSensitivePublicFields,
    enforcePublicThrottle: enforcePublicThrottle
  };

  // ─── HOOK: Crear Cotización ─────────────────────────────────────────────────

  /**
   * Hook que se ejecuta al crear un registro en "cotizaciones".
   *
   * Para solicitudes de superusuario: pasa sin restricciones.
   * Para solicitudes públicas (sin auth):
   *   - Fuerza status = "pendiente"
   *   - Valida el tenant contra la whitelist
   *   - Sanitiza campos de texto (nombre, contacto)
   *   - Valida formato de email y teléfono
   *   - Limpia campos sensibles (orden, contrato, factura, etc.)
   */
  onRecordCreateRequest(function (e) {
    function stripTagsLocal(v) {
      return String(v || "").replace(/<[^>]*>/g, "");
    }

    function sanitizeText(v, maxLen) {
      var text = stripTagsLocal(String(v || "")).trim();
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      if (maxLen && text.length > maxLen) text = text.slice(0, maxLen);
      return text;
    }

    function safeArray(v) {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          var parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    }

    function safeObject(v) {
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          var parsed = JSON.parse(v);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
          return {};
        }
      }
      return {};
    }

    function sanitizeDate(v) {
      var text = String(v || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text)) return text.slice(0, 10);
      return "";
    }

    function clampInt(v, min, max) {
      var num = parseInt(v, 10);
      if (isNaN(num)) num = 0;
      if (typeof min === "number" && num < min) num = min;
      if (typeof max === "number" && num > max) num = max;
      return num;
    }

    function uniqueSortedDates(list) {
      var map = {};
      var out = [];
      var values = safeArray(list);
      for (var i = 0; i < values.length; i += 1) {
        var ds = sanitizeDate(values[i]);
        if (!ds || map[ds]) continue;
        map[ds] = true;
        out.push(ds);
      }
      out.sort();
      return out;
    }

    function diffDays(start, end) {
      var a = sanitizeDate(start);
      var b = sanitizeDate(end);
      if (!a || !b) return -1;
      var startDate = new Date(a + "T00:00:00Z");
      var endDate = new Date(b + "T00:00:00Z");
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return -1;
      return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    }

    function sanitizeSpaceDetail(raw, tenant) {
      var detail = safeObject(raw);
      var start = sanitizeDate(detail.fecha_inicio);
      var end = sanitizeDate(detail.fecha_fin || detail.fecha_inicio);
      if (!start || !end || diffDays(start, end) < 0 || diffDays(start, end) > 366) return null;

      var premDates = uniqueSortedDates(detail.premontaje_fechas).slice(0, 31);
      var horario = safeObject(detail.horario);
      var normalized = {
        espacio_id: sanitizeText(detail.espacio_id || detail.space_id, 80),
        espacio_nombre: sanitizeText(detail.espacio_nombre, 200),
        espacio_clave: sanitizeText(detail.espacio_clave || detail.space_key, 80),
        fecha_inicio: start,
        fecha_fin: end,
        personas: clampInt(detail.personas, 0, 100000),
        horario: {
          label: sanitizeText(horario.label || detail.horario_label, 120)
        },
        premontaje_dias: clampInt(detail.premontaje_dias, 0, 31),
        premontaje_fechas: premDates,
        horas_extra: clampInt(detail.horas_extra, 0, 48)
      };

      if (!normalized.espacio_id) return null;
      if (tenant === "casa_de_piedra") {
        normalized.premontaje_dias = Math.min(normalized.premontaje_dias, premDates.length || normalized.premontaje_dias);
      } else {
        normalized.premontaje_dias = 0;
        normalized.premontaje_fechas = [];
        normalized.horas_extra = 0;
      }
      return normalized;
    }

    function sanitizeEventDetails(raw, fallbackName, spaceCount) {
      var data = safeObject(raw);
      return {
        multi_espacio: !!data.multi_espacio || clampInt(data.total_espacios, 0, 99) > 1 || spaceCount > 1,
        total_espacios: clampInt(data.total_espacios || spaceCount, 0, 99),
        nombre_cotizacion: sanitizeText(data.nombre_cotizacion || fallbackName, 300)
      };
    }

    function parseMoney(value) {
      if (typeof value === "number") return isNaN(value) ? NaN : value;
      if (typeof value === "string") {
        var raw = value.replace(/,/g, "").trim();
        if (!raw) return NaN;
        var parsed = parseFloat(raw);
        return isNaN(parsed) ? NaN : parsed;
      }
      if (value === null || value === undefined) return NaN;
      var numeric = parseFloat(String(value || "").replace(/,/g, "").trim());
      return isNaN(numeric) ? NaN : numeric;
    }

    function safeMoney(value, fallback) {
      var parsed = parseMoney(value);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
      return typeof fallback === "number" ? fallback : 0;
    }

    function computeFinancialSubtotal(detail) {
      var row = safeObject(detail);
      var taxTotal = safeMoney(row.impuestos_total || row.taxTotal, 0);
      var total = parseMoney(row.total_espacio || row.total);
      if (!isNaN(total) && isFinite(total)) return Math.max(0, total - taxTotal);
      var baseValue = safeMoney(row.subtotal_espacio || row.subtotalBeforeTax || row.baseValue, 0);
      var convenioValue = safeMoney(row.convenio_monto_entregado || row.convenioValue, 0);
      var convenioActivo = row.convenio_activo === true || row.convenioEnabled === true;
      return convenioActivo ? Math.max(0, baseValue - convenioValue) : Math.max(0, baseValue);
    }

    function normalizeFinancialDetail(detail) {
      var row = safeObject(detail);
      var subtotalBase = safeMoney(row.subtotal_espacio || row.subtotalBeforeTax || row.baseValue, 0);
      var taxTotal = safeMoney(row.impuestos_total || row.taxTotal, 0);
      var convenioValue = safeMoney(row.convenio_monto_entregado || row.convenioValue, 0);
      var convenioActivo = row.convenio_activo === true || row.convenioEnabled === true;
      var subtotalComputed = computeFinancialSubtotal({
        subtotal_espacio: subtotalBase,
        impuestos_total: taxTotal,
        convenio_monto_entregado: convenioValue,
        convenio_activo: convenioActivo,
        total_espacio: row.total_espacio || row.total
      });
      var total = safeMoney(row.total_espacio || row.total, subtotalComputed + taxTotal);
      var convenioBalance = safeMoney(
        row.convenio_balance,
        convenioActivo ? Math.max(0, subtotalBase - convenioValue) : subtotalComputed
      );
      row.subtotal_espacio = subtotalBase;
      row.impuestos_total = taxTotal;
      row.convenio_monto_entregado = convenioValue;
      row.total_espacio = total;
      row.convenio_balance = convenioBalance;
      return row;
    }

    function ensureQuoteFinancials(record) {
      if (!record) return;
      var breakdown = safeObject(record.get("desglose_precios"));
      var detailRows = safeArray(record.get("espacios_detalle"));
      var breakdownRows = safeArray(breakdown.espacios);
      var sourceRows = detailRows.length ? detailRows : breakdownRows;
      var normalizedRows = [];
      for (var i = 0; i < sourceRows.length; i += 1) {
        normalizedRows.push(normalizeFinancialDetail(sourceRows[i]));
      }

      var subtotalFromRows = 0;
      var taxesFromRows = 0;
      var totalFromRows = 0;
      for (var j = 0; j < normalizedRows.length; j += 1) {
        subtotalFromRows += computeFinancialSubtotal(normalizedRows[j]);
        taxesFromRows += safeMoney(normalizedRows[j].impuestos_total, 0);
        totalFromRows += safeMoney(normalizedRows[j].total_espacio, 0);
      }

      var subtotal = safeMoney(breakdown.subtotal_antes_impuestos, subtotalFromRows);
      var taxes = safeMoney(breakdown.tax_total, taxesFromRows);
      var finalPrice = parseMoney(record.get("precio_final"));
      if (isNaN(finalPrice) || !isFinite(finalPrice)) finalPrice = parseMoney(breakdown.precio_final_usado);
      if (isNaN(finalPrice) || !isFinite(finalPrice)) finalPrice = subtotal + taxes;
      if ((isNaN(finalPrice) || !isFinite(finalPrice)) && normalizedRows.length) finalPrice = totalFromRows;
      finalPrice = Math.max(0, safeMoney(finalPrice, 0));

      breakdown.subtotal_antes_impuestos = Math.max(0, safeMoney(subtotal, 0));
      breakdown.tax_total = Math.max(0, safeMoney(taxes, 0));
      if (breakdown.precio_final_usado !== undefined || breakdown.auto_calculado !== undefined) {
        breakdown.precio_final_usado = Math.max(0, safeMoney(breakdown.precio_final_usado, finalPrice));
        breakdown.auto_calculado = Math.max(0, safeMoney(breakdown.auto_calculado, finalPrice));
      }
      if (breakdown.convenio_balance_total !== undefined || normalizedRows.length) {
        breakdown.convenio_balance_total = Math.max(0, safeMoney(breakdown.convenio_balance_total, finalPrice));
      }
      if (breakdown.convenio_base_total !== undefined) {
        breakdown.convenio_base_total = Math.max(0, safeMoney(breakdown.convenio_base_total, 0));
      }
      if (breakdown.convenio_entregable_total !== undefined) {
        breakdown.convenio_entregable_total = Math.max(0, safeMoney(breakdown.convenio_entregable_total, 0));
      }
      if (normalizedRows.length) breakdown.espacios = normalizedRows;

      record.set("precio_final", finalPrice);
      record.set("desglose_precios", breakdown);
    }

    function clearSensitivePublicFields(record) {
      record.set("datos_fiscales", {});
      record.set("historial_pagos", []);
      record.set("datos_factura", {});
      record.set("cliente_id", "");
      record.set("cliente_rfc", "");
      record.set("notas_pdf", []);
      record.set("numero_orden", "");
      record.set("numero_contrato", "");
      record.set("factura_pdf_url", "");
      record.set("factura_xml_url", "");
      record.set("contrato_url", "");
      record.set("url_cotizacion_final", "");
      record.set("url_orden_compra", "");
      record.set("factura_pdf_file", []);
      record.set("factura_xml_file", []);
      record.set("contrato_file", []);
      record.set("cotizacion_final_file", []);
      record.set("orden_compra_file", []);
    }

    function getPublicThrottleStore() {
      if (!globalThis.__COTIZADOR_PUBLIC_QUOTE_THROTTLE__) {
        globalThis.__COTIZADOR_PUBLIC_QUOTE_THROTTLE__ = {};
      }
      return globalThis.__COTIZADOR_PUBLIC_QUOTE_THROTTLE__;
    }

    function enforcePublicThrottle(tenant, email, phone) {
      var now = Date.now();
      var windowMs = 10 * 60 * 1000;
      var duplicateWindowMs = 45 * 1000;
      var maxCreatesPerWindow = 4;
      var key = [
        String(tenant || "").trim().toLowerCase(),
        String(email || "").trim().toLowerCase(),
        String(phone || "").replace(/\D+/g, "")
      ].join("|");
      var store = getPublicThrottleStore();
      var recent = Array.isArray(store[key]) ? store[key] : [];
      recent = recent.filter(function (ts) {
        return typeof ts === "number" && (now - ts) < windowMs;
      });
      if (recent.length && (now - recent[recent.length - 1]) < duplicateWindowMs) {
        throw new BadRequestError("La solicitud ya fue recibida. Espera un momento antes de intentarlo de nuevo.");
      }
      if (recent.length >= maxCreatesPerWindow) {
        throw new BadRequestError("Se alcanzó el límite temporal de solicitudes. Intenta nuevamente más tarde.");
      }
      recent.push(now);
      store[key] = recent;
    }

    function normalizePhoneLocal(v) {
      var digits = String(v || "").replace(/\D+/g, "").slice(-10);
      return digits.length === 10 ? digits : "";
    }

    function normalizeEmailLocal(v) {
      var value = sanitizeText(v, 255).toLowerCase();
      if (!value) return "";
      return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(value) ? value : "";
    }

    function loadClientRecordLocal(clientId) {
      var safeId = sanitizeText(clientId, 64).replace(/[^a-zA-Z0-9]/g, "");
      if (!safeId) return null;
      try {
        return $app.findRecordById("clientes", safeId);
      } catch (_) {
        return null;
      }
    }

    function syncQuoteClientSnapshotLocal(record) {
      var clientRecord = loadClientRecordLocal(record.getString("cliente_id"));
      if (!clientRecord) return;

      var tenant = sanitizeText(record.getString("tenant"), 40).toLowerCase();
      var clientTenant = sanitizeText(clientRecord.getString("tenant"), 40).toLowerCase();
      if (tenant && clientTenant && tenant !== clientTenant) {
        throw new BadRequestError("El perfil del cliente no pertenece al tenant de esta cotizacion.");
      }

      var clientName = sanitizeText(clientRecord.getString("nombre_completo"), 255);
      var clientRfc = sanitizeText(clientRecord.getString("rfc"), 40).toUpperCase();
      var clientPhone = normalizePhoneLocal(clientRecord.getString("telefono"));
      var clientEmail = normalizeEmailLocal(clientRecord.getString("correo"));

      if (clientName) record.set("cliente_nombre", clientName);
      if (clientRfc) record.set("cliente_rfc", clientRfc);
      if (clientPhone) {
        record.set("cliente_telefono", clientPhone);
        if (!sanitizeText(record.getString("cliente_contacto"), 80)) {
          record.set("cliente_contacto", clientPhone);
        }
      }
      if (clientEmail) record.set("cliente_email", clientEmail);

      var datosFiscales = safeObject(record.get("datos_fiscales"));
      if (clientRfc) datosFiscales.rfc_receptor = clientRfc;
      if (clientName) datosFiscales.razon_social_receptor = clientName;
      if (clientEmail) datosFiscales.correo_receptor = clientEmail;
      record.set("datos_fiscales", datosFiscales);
    }

    function hasRecordValueLocal(value) {
      if (Array.isArray(value)) return value.filter(Boolean).length > 0;
      if (value && typeof value === "object") return true;
      return sanitizeText(value, 500) !== "";
    }

    function clientHasSavedDictamenLocal(clientId, tenant) {
      var safeId = sanitizeText(clientId, 64).replace(/[^a-zA-Z0-9]/g, "");
      var safeTenant = sanitizeText(tenant, 40).toLowerCase();
      if (!safeId || (safeTenant !== "plaza_mayor" && safeTenant !== "casa_de_piedra")) return false;
      try {
        var records = $app.findRecordsByFilter(
          "clientes_dictamenes",
          "cliente = '" + safeId + "' && tenant = '" + safeTenant + "'",
          "-created",
          1,
          0
        ) || [];
        for (var i = 0; i < records.length; i += 1) {
          if (hasRecordValueLocal(records[i].get("pdf"))) return true;
        }
      } catch (_) { }
      return false;
    }

    function isTruthyReadyFlagLocal(value) {
      if (value === true || value === 1) return true;
      var normalized = sanitizeText(value, 40).toLowerCase();
      return normalized === "true" ||
        normalized === "1" ||
        normalized === "si" ||
        normalized === "yes" ||
        normalized === "aprobado" ||
        normalized === "aprobada" ||
        normalized === "validado" ||
        normalized === "validada" ||
        normalized === "listo" ||
        normalized === "lista";
    }

    function isReadyStatusValueLocal(value) {
      var normalized = sanitizeText(value, 80).toLowerCase();
      return normalized === "validado" ||
        normalized === "validada" ||
        normalized === "aprobado" ||
        normalized === "aprobada" ||
        normalized === "listo" ||
        normalized === "lista" ||
        normalized === "listo_para_cotizar" ||
        normalized === "lista_para_cotizar";
    }

    function ensureClientReadyForContractLocal(record) {
      var clientId = sanitizeText(record.getString("cliente_id"), 64).replace(/[^a-zA-Z0-9]/g, "");
      if (!clientId) {
        throw new BadRequestError("Para generar contrato debes seleccionar un perfil de cliente validado.");
      }
      var clientRecord = loadClientRecordLocal(clientId);
      if (!clientRecord) {
        throw new BadRequestError("No se encontro el perfil de cliente asociado al contrato.");
      }
      var tenant = sanitizeText(record.getString("tenant"), 40).toLowerCase();
      var clientTenant = sanitizeText(clientRecord.getString("tenant"), 40).toLowerCase();
      if (tenant && clientTenant && tenant !== clientTenant) {
        throw new BadRequestError("El perfil del cliente no pertenece al tenant de esta cotizacion.");
      }
      var validation = safeObject(clientRecord.get("expediente_validacion"));
      var readyForQuotes =
        isTruthyReadyFlagLocal(clientRecord.get("perfil_validado")) ||
        isTruthyReadyFlagLocal(validation.readyForQuotes) ||
        isTruthyReadyFlagLocal(validation.ready) ||
        isTruthyReadyFlagLocal(validation.puedeCotizar) ||
        isTruthyReadyFlagLocal(validation.quoteApproved) ||
        isTruthyReadyFlagLocal(validation.quoteReady) ||
        isTruthyReadyFlagLocal(validation.readyForContracts) ||
        isReadyStatusValueLocal(clientRecord.getString("perfil_estatus")) ||
        isReadyStatusValueLocal(validation.status);
      if (!readyForQuotes) {
        throw new BadRequestError("El expediente del cliente debe estar completo, vigente y aprobado antes de generar contrato.");
      }
      if (!clientHasSavedDictamenLocal(clientId, clientTenant || tenant)) {
        throw new BadRequestError("Para generar contrato necesitas un dictamen aprobado o guardado del cliente.");
      }
    }

    function comparableValueLocal(record, field) {
      if (!record) return "";
      var value = record.get(field);
      if (value === null || value === undefined) return "";
      if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean));
      if (value && typeof value === "object") return JSON.stringify(value);
      return String(value || "");
    }

    function contractFieldsTouchedLocal(record, original) {
      var fields = ["numero_contrato", "contrato_url", "contrato_file"];
      for (var i = 0; i < fields.length; i += 1) {
        var field = fields[i];
        if (!hasRecordValueLocal(record.get(field))) continue;
        if (!original || comparableValueLocal(record, field) !== comparableValueLocal(original, field)) return true;
      }
      return false;
    }

    function normalizeDiscountTypeLocal(value) {
      var raw = sanitizeText(value, 40).toLowerCase();
      if (raw === "descuento" || raw === "discount") return "descuento";
      if (raw === "porcentaje" || raw === "percent" || raw === "percentage") return "porcentaje";
      if (raw === "monto_fijo" || raw === "fixed" || raw === "fijo") return "monto_fijo";
      return raw || "ninguno";
    }

    function getQuoteDiscountBaseLocal(record) {
      var breakdown = safeObject(record.get("desglose_precios"));
      var candidates = [
        breakdown.subtotal_antes_impuestos,
        breakdown.auto_calculado,
        breakdown.precio_final_usado,
        record.get("precio_final")
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var value = safeMoney(candidates[i], -1);
        if (value > 0) return value;
      }
      return 0;
    }

    function enforceQuoteDiscountLimitLocal(record) {
      var maxPercent = 10;
      var base = getQuoteDiscountBaseLocal(record);
      var maxFixed = base * (maxPercent / 100);
      var totalFixedDiscount = 0;
      var topType = normalizeDiscountTypeLocal(record.getString("tipo_ajuste"));
      var topValue = Math.max(0, safeMoney(record.get("valor_ajuste"), 0));
      if (topType === "descuento" && topValue > 0) {
        if (record.get("ajuste_es_porcentaje") === true) {
          if (topValue > maxPercent) {
            throw new BadRequestError("El descuento maximo permitido es 10%.");
          }
          totalFixedDiscount += base * (topValue / 100);
        } else {
          totalFixedDiscount += topValue;
        }
      }

      var concepts = safeArray(record.get("conceptos_adicionales"));
      for (var i = 0; i < concepts.length; i += 1) {
        var concept = safeObject(concepts[i]);
        var conceptType = normalizeDiscountTypeLocal(concept.type || concept.tipo || concept.kind);
        if (conceptType !== "descuento") continue;
        var amount = Math.max(0, safeMoney(concept.amount !== undefined ? concept.amount : concept.value, 0));
        var unit = normalizeDiscountTypeLocal(concept.unit || concept.unidad || "");
        if (unit === "porcentaje") {
          if (amount > maxPercent) {
            throw new BadRequestError("El descuento maximo permitido es 10%.");
          }
          totalFixedDiscount += base * (amount / 100);
        } else {
          totalFixedDiscount += amount;
        }
      }

      if (base <= 0 && totalFixedDiscount > 0.01) {
        throw new BadRequestError("No se puede aplicar descuento sin una base de cotizacion valida.");
      }
      if (base > 0 && totalFixedDiscount > maxFixed + 0.01) {
        throw new BadRequestError("El descuento total no puede superar el 10% de la cotizacion.");
      }
    }

    // Superusuarios (admin PB) pueden crear sin restricciones
    if (e.hasSuperuserAuth && e.hasSuperuserAuth()) {
      return e.next();
    }

    // ── Solicitud pública (sin autenticación) ──
    if (!e.auth) {
      // Forzar status pendiente para todas las solicitudes públicas
      e.record.set("status", "pendiente");

      // Validar que el tenant sea uno de los valores permitidos
      var tenant = String(e.record.get("tenant") || "").trim().toLowerCase();
      if (!tenant || (tenant !== "plaza_mayor" && tenant !== "casa_de_piedra")) {
        throw new BadRequestError("El campo tenant es obligatorio y debe ser un valor válido.");
      }
      e.record.set("tenant", tenant);

      // Sanitizar nombre del cliente (max 200 chars, sin HTML)
      var clienteNombre = sanitizeText(e.record.getString("cliente_nombre"), 200);
      if (!clienteNombre) {
        throw new BadRequestError("El nombre del cliente es obligatorio.");
      }
      e.record.set("cliente_nombre", clienteNombre);

      // Validar formato de email (RFC básico, max 254 chars)
      var clienteEmail = String(e.record.getString("cliente_email") || "").trim();
      if (!clienteEmail) {
        throw new BadRequestError("El email del cliente es obligatorio.");
      }
      if (clienteEmail) {
        if (clienteEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(clienteEmail)) {
          throw new BadRequestError("El email proporcionado no es válido.");
        }
        e.record.set("cliente_email", clienteEmail);
      }

      // Validar formato de teléfono (solo dígitos, +, -, espacios, paréntesis)
      var clienteTelefono = String(e.record.getString("cliente_telefono") || "").trim();
      if (clienteTelefono) {
        if (clienteTelefono.length > 30 || !/^[\d\s+\-().]+$/.test(clienteTelefono)) {
          throw new BadRequestError("El teléfono proporcionado no es válido.");
        }
        e.record.set("cliente_telefono", clienteTelefono);
      }

      // Sanitizar otros campos de texto libre
      var nombreCotizacion = sanitizeText(e.record.getString("nombre_cotizacion"), 300);
      if (nombreCotizacion) e.record.set("nombre_cotizacion", nombreCotizacion);
      else nombreCotizacion = sanitizeText(e.record.getString("espacio_nombre"), 200) || "Solicitud pública";

      var clienteContacto = sanitizeText(e.record.getString("cliente_contacto"), 200);
      if (clienteContacto) e.record.set("cliente_contacto", clienteContacto);
      else if (clienteTelefono) {
        clienteContacto = clienteTelefono;
        e.record.set("cliente_contacto", clienteTelefono);
      }
      if (!clienteContacto && !clienteTelefono) {
        throw new BadRequestError("El teléfono o contacto del cliente es obligatorio.");
      }

      var espacioId = sanitizeText(e.record.getString("espacio_id"), 80);
      var espacioNombre = sanitizeText(e.record.getString("espacio_nombre"), 200);
      var espacioClave = sanitizeText(e.record.getString("espacio_clave"), 80);
      if (!espacioId) {
        throw new BadRequestError("El espacio solicitado es obligatorio.");
      }
      e.record.set("espacio_id", espacioId);
      e.record.set("espacio_nombre", espacioNombre);
      e.record.set("espacio_clave", espacioClave);

      var fechaInicio = sanitizeDate(e.record.getString("fecha_inicio"));
      var fechaFin = sanitizeDate(e.record.getString("fecha_fin") || fechaInicio);
      if (!fechaInicio || !fechaFin || diffDays(fechaInicio, fechaFin) < 0 || diffDays(fechaInicio, fechaFin) > 366) {
        throw new BadRequestError("Las fechas seleccionadas no son válidas.");
      }
      e.record.set("fecha_inicio", fechaInicio);
      e.record.set("fecha_fin", fechaFin);
      e.record.set("personas", clampInt(e.record.get("personas"), 0, 100000));

      var rawSpaces = safeArray(e.record.get("espacios_detalle"));
      var sanitizedSpaces = [];
      for (var i = 0; i < rawSpaces.length && sanitizedSpaces.length < 12; i += 1) {
        var normalizedSpace = sanitizeSpaceDetail(rawSpaces[i], tenant);
        if (normalizedSpace) sanitizedSpaces.push(normalizedSpace);
      }
      if (sanitizedSpaces.length) {
        sanitizedSpaces.sort(function (a, b) {
          return String(a.fecha_inicio).localeCompare(String(b.fecha_inicio));
        });
        e.record.set("espacios_detalle", sanitizedSpaces);
        e.record.set("espacio_id", sanitizedSpaces[0].espacio_id || espacioId);
        e.record.set("espacio_nombre", sanitizedSpaces[0].espacio_nombre || espacioNombre);
        e.record.set("espacio_clave", sanitizedSpaces[0].espacio_clave || espacioClave);
        e.record.set("fecha_inicio", sanitizedSpaces[0].fecha_inicio);
        e.record.set("fecha_fin", sanitizedSpaces[sanitizedSpaces.length - 1].fecha_fin);
      } else {
        e.record.set("espacios_detalle", []);
      }

      e.record.set(
        "detalles_evento",
        sanitizeEventDetails(e.record.get("detalles_evento"), nombreCotizacion, sanitizedSpaces.length)
      );

      clearSensitivePublicFields(e.record);
      enforcePublicThrottle(tenant, clienteEmail, clienteTelefono || clienteContacto, nombreCotizacion);

      if (!e.record.getString("nombre_cotizacion")) {
        e.record.set("nombre_cotizacion", nombreCotizacion);
      }
    }

    syncQuoteClientSnapshotLocal(e.record);
    ensureQuoteFinancials(e.record);
    enforceQuoteDiscountLimitLocal(e.record);
    if (contractFieldsTouchedLocal(e.record, null)) {
      ensureClientReadyForContractLocal(e.record);
    }

    e.next();
  }, "cotizaciones");

  // ─── HOOK: Actualizar Cotización ────────────────────────────────────────────

  /**
   * Hook que se ejecuta al actualizar un registro en "cotizaciones".
   * Superusuarios pueden actualizar sin restricciones.
   * Usuarios autenticados normales también pueden (con sus reglas de API).
   */
  onRecordUpdateRequest(function (e) {
    if (e.hasSuperuserAuth && e.hasSuperuserAuth()) {
      return e.next();
    }
    function stripTagsLocal(v) {
      return String(v || "").replace(/<[^>]*>/g, "");
    }

    function sanitizeText(v, maxLen) {
      var text = stripTagsLocal(String(v || "")).trim();
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      if (maxLen && text.length > maxLen) text = text.slice(0, maxLen);
      return text;
    }

    function safeArray(v) {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          var parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    }

    function safeObject(v) {
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          var parsed = JSON.parse(v);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
          return {};
        }
      }
      return {};
    }

    function parseMoney(value) {
      if (typeof value === "number") return isNaN(value) ? NaN : value;
      if (typeof value === "string") {
        var raw = value.replace(/,/g, "").trim();
        if (!raw) return NaN;
        var parsed = parseFloat(raw);
        return isNaN(parsed) ? NaN : parsed;
      }
      if (value === null || value === undefined) return NaN;
      var numeric = parseFloat(String(value || "").replace(/,/g, "").trim());
      return isNaN(numeric) ? NaN : numeric;
    }

    function safeMoney(value, fallback) {
      var parsed = parseMoney(value);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
      return typeof fallback === "number" ? fallback : 0;
    }

    function normalizePhoneLocal(v) {
      var digits = String(v || "").replace(/\D+/g, "").slice(-10);
      return digits.length === 10 ? digits : "";
    }

    function normalizeEmailLocal(v) {
      var value = sanitizeText(v, 255).toLowerCase();
      if (!value) return "";
      return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(value) ? value : "";
    }

    function loadClientRecordLocal(clientId) {
      var safeId = sanitizeText(clientId, 64).replace(/[^a-zA-Z0-9]/g, "");
      if (!safeId) return null;
      try {
        return $app.findRecordById("clientes", safeId);
      } catch (_) {
        return null;
      }
    }

    function syncQuoteClientSnapshotLocal(record) {
      var clientRecord = loadClientRecordLocal(record.getString("cliente_id"));
      if (!clientRecord) return;

      var tenant = sanitizeText(record.getString("tenant"), 40).toLowerCase();
      var clientTenant = sanitizeText(clientRecord.getString("tenant"), 40).toLowerCase();
      if (tenant && clientTenant && tenant !== clientTenant) {
        throw new BadRequestError("El perfil del cliente no pertenece al tenant de esta cotizacion.");
      }

      var clientName = sanitizeText(clientRecord.getString("nombre_completo"), 255);
      var clientRfc = sanitizeText(clientRecord.getString("rfc"), 40).toUpperCase();
      var clientPhone = normalizePhoneLocal(clientRecord.getString("telefono"));
      var clientEmail = normalizeEmailLocal(clientRecord.getString("correo"));

      if (clientName) record.set("cliente_nombre", clientName);
      if (clientRfc) record.set("cliente_rfc", clientRfc);
      if (clientPhone) {
        record.set("cliente_telefono", clientPhone);
        if (!sanitizeText(record.getString("cliente_contacto"), 80)) {
          record.set("cliente_contacto", clientPhone);
        }
      }
      if (clientEmail) record.set("cliente_email", clientEmail);

      var datosFiscales = safeObject(record.get("datos_fiscales"));
      if (clientRfc) datosFiscales.rfc_receptor = clientRfc;
      if (clientName) datosFiscales.razon_social_receptor = clientName;
      if (clientEmail) datosFiscales.correo_receptor = clientEmail;
      record.set("datos_fiscales", datosFiscales);
    }

    function hasRecordValueLocal(value) {
      if (Array.isArray(value)) return value.filter(Boolean).length > 0;
      if (value && typeof value === "object") return true;
      return sanitizeText(value, 500) !== "";
    }

    function clientHasSavedDictamenLocal(clientId, tenant) {
      var safeId = sanitizeText(clientId, 64).replace(/[^a-zA-Z0-9]/g, "");
      var safeTenant = sanitizeText(tenant, 40).toLowerCase();
      if (!safeId || (safeTenant !== "plaza_mayor" && safeTenant !== "casa_de_piedra")) return false;
      try {
        var records = $app.findRecordsByFilter(
          "clientes_dictamenes",
          "cliente = '" + safeId + "' && tenant = '" + safeTenant + "'",
          "-created",
          1,
          0
        ) || [];
        for (var i = 0; i < records.length; i += 1) {
          if (hasRecordValueLocal(records[i].get("pdf"))) return true;
        }
      } catch (_) { }
      return false;
    }

    function isTruthyReadyFlagLocal(value) {
      if (value === true || value === 1) return true;
      var normalized = sanitizeText(value, 40).toLowerCase();
      return normalized === "true" ||
        normalized === "1" ||
        normalized === "si" ||
        normalized === "yes" ||
        normalized === "aprobado" ||
        normalized === "aprobada" ||
        normalized === "validado" ||
        normalized === "validada" ||
        normalized === "listo" ||
        normalized === "lista";
    }

    function isReadyStatusValueLocal(value) {
      var normalized = sanitizeText(value, 80).toLowerCase();
      return normalized === "validado" ||
        normalized === "validada" ||
        normalized === "aprobado" ||
        normalized === "aprobada" ||
        normalized === "listo" ||
        normalized === "lista" ||
        normalized === "listo_para_cotizar" ||
        normalized === "lista_para_cotizar";
    }

    function ensureClientReadyForContractLocal(record) {
      var clientId = sanitizeText(record.getString("cliente_id"), 64).replace(/[^a-zA-Z0-9]/g, "");
      if (!clientId) {
        throw new BadRequestError("Para generar contrato debes seleccionar un perfil de cliente validado.");
      }
      var clientRecord = loadClientRecordLocal(clientId);
      if (!clientRecord) {
        throw new BadRequestError("No se encontro el perfil de cliente asociado al contrato.");
      }
      var tenant = sanitizeText(record.getString("tenant"), 40).toLowerCase();
      var clientTenant = sanitizeText(clientRecord.getString("tenant"), 40).toLowerCase();
      if (tenant && clientTenant && tenant !== clientTenant) {
        throw new BadRequestError("El perfil del cliente no pertenece al tenant de esta cotizacion.");
      }
      var validation = safeObject(clientRecord.get("expediente_validacion"));
      var readyForQuotes =
        isTruthyReadyFlagLocal(clientRecord.get("perfil_validado")) ||
        isTruthyReadyFlagLocal(validation.readyForQuotes) ||
        isTruthyReadyFlagLocal(validation.ready) ||
        isTruthyReadyFlagLocal(validation.puedeCotizar) ||
        isTruthyReadyFlagLocal(validation.quoteApproved) ||
        isTruthyReadyFlagLocal(validation.quoteReady) ||
        isTruthyReadyFlagLocal(validation.readyForContracts) ||
        isReadyStatusValueLocal(clientRecord.getString("perfil_estatus")) ||
        isReadyStatusValueLocal(validation.status);
      if (!readyForQuotes) {
        throw new BadRequestError("El expediente del cliente debe estar completo, vigente y aprobado antes de generar contrato.");
      }
      if (!clientHasSavedDictamenLocal(clientId, clientTenant || tenant)) {
        throw new BadRequestError("Para generar contrato necesitas un dictamen aprobado o guardado del cliente.");
      }
    }

    function comparableValueLocal(record, field) {
      if (!record) return "";
      var value = record.get(field);
      if (value === null || value === undefined) return "";
      if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean));
      if (value && typeof value === "object") return JSON.stringify(value);
      return String(value || "");
    }

    function contractFieldsTouchedLocal(record, original) {
      var fields = ["numero_contrato", "contrato_url", "contrato_file"];
      for (var i = 0; i < fields.length; i += 1) {
        var field = fields[i];
        if (!hasRecordValueLocal(record.get(field))) continue;
        if (!original || comparableValueLocal(record, field) !== comparableValueLocal(original, field)) return true;
      }
      return false;
    }

    function normalizeDiscountTypeLocal(value) {
      var raw = sanitizeText(value, 40).toLowerCase();
      if (raw === "descuento" || raw === "discount") return "descuento";
      if (raw === "porcentaje" || raw === "percent" || raw === "percentage") return "porcentaje";
      if (raw === "monto_fijo" || raw === "fixed" || raw === "fijo") return "monto_fijo";
      return raw || "ninguno";
    }

    function getQuoteDiscountBaseLocal(record) {
      var breakdown = safeObject(record.get("desglose_precios"));
      var candidates = [
        breakdown.subtotal_antes_impuestos,
        breakdown.auto_calculado,
        breakdown.precio_final_usado,
        record.get("precio_final")
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var value = safeMoney(candidates[i], -1);
        if (value > 0) return value;
      }
      return 0;
    }

    function enforceQuoteDiscountLimitLocal(record) {
      var maxPercent = 10;
      var base = getQuoteDiscountBaseLocal(record);
      var maxFixed = base * (maxPercent / 100);
      var totalFixedDiscount = 0;
      var topType = normalizeDiscountTypeLocal(record.getString("tipo_ajuste"));
      var topValue = Math.max(0, safeMoney(record.get("valor_ajuste"), 0));
      if (topType === "descuento" && topValue > 0) {
        if (record.get("ajuste_es_porcentaje") === true) {
          if (topValue > maxPercent) {
            throw new BadRequestError("El descuento maximo permitido es 10%.");
          }
          totalFixedDiscount += base * (topValue / 100);
        } else {
          totalFixedDiscount += topValue;
        }
      }

      var concepts = safeArray(record.get("conceptos_adicionales"));
      for (var i = 0; i < concepts.length; i += 1) {
        var concept = safeObject(concepts[i]);
        var conceptType = normalizeDiscountTypeLocal(concept.type || concept.tipo || concept.kind);
        if (conceptType !== "descuento") continue;
        var amount = Math.max(0, safeMoney(concept.amount !== undefined ? concept.amount : concept.value, 0));
        var unit = normalizeDiscountTypeLocal(concept.unit || concept.unidad || "");
        if (unit === "porcentaje") {
          if (amount > maxPercent) {
            throw new BadRequestError("El descuento maximo permitido es 10%.");
          }
          totalFixedDiscount += base * (amount / 100);
        } else {
          totalFixedDiscount += amount;
        }
      }

      if (base <= 0 && totalFixedDiscount > 0.01) {
        throw new BadRequestError("No se puede aplicar descuento sin una base de cotizacion valida.");
      }
      if (base > 0 && totalFixedDiscount > maxFixed + 0.01) {
        throw new BadRequestError("El descuento total no puede superar el 10% de la cotizacion.");
      }
    }

    var original = e && e.record && typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
    syncQuoteClientSnapshotLocal(e.record);
    enforceQuoteDiscountLimitLocal(e.record);
    if (contractFieldsTouchedLocal(e.record, original)) {
      ensureClientReadyForContractLocal(e.record);
    }
    e.next();
  }, "cotizaciones");

  // ─── HOOK: Enriquecer Respuesta ─────────────────────────────────────────────

  /**
   * Hook que se ejecuta al devolver registros de "cotizaciones" en respuestas API.
   * Para usuarios autenticados: devuelve todos los campos.
   * Para solicitudes públicas: oculta campos sensibles (precios, datos fiscales,
   * documentos, facturas, contratos, etc.) para prevenir fuga de información.
   */
  onRecordEnrich(function (e) {
    // Usuarios autenticados ven todos los campos
    if (e.requestInfo && e.requestInfo.auth) {
      return e.next();
    }

    // Ocultar campos sensibles para solicitudes públicas/anónimas
    e.record.hide(
      "precio_final",           // Precio final de la cotización
      "desglose_precios",       // Detalle de subtotales e impuestos
      "cliente_rfc",            // RFC del cliente
      "cliente_contacto",       // Persona de contacto
      "cliente_email",          // Email del cliente
      "cliente_telefono",       // Teléfono del cliente
      "numero_orden",           // Número de orden de compra
      "numero_contrato",        // Número de contrato
      "factura_pdf_url",        // URL del PDF de factura
      "factura_xml_url",        // URL del XML de factura
      "contrato_url",           // URL del contrato
      "url_cotizacion_final",   // URL de la cotización final
      "url_orden_compra",       // URL de la orden de compra
      "datos_fiscales",         // Datos fiscales del cliente
      "conceptos_adicionales",  // Conceptos/servicios adicionales
      "espacios_detalle",       // Detalle logístico multi-espacio
      "detalles_evento",        // Metadatos del evento
      "tipo_ajuste",            // Tipo de ajuste de precio
      "valor_ajuste",           // Valor del ajuste
      "ajuste_es_porcentaje",   // Si el ajuste es porcentual
      "desglose_impuestos",     // Detalle de impuestos aplicados
      "historial_pagos",        // Historial de pagos recibidos
      "datos_factura",          // Datos de la factura generada
      "notas_pdf",              // Notas internas del PDF
      "cliente_id",      // ID interno del cliente
      "factura_pdf_file",       // Archivo PDF de factura
      "factura_xml_file",       // Archivo XML de factura
      "contrato_file",          // Archivo de contrato
      "cotizacion_final_file",  // Archivo de cotización final
      "orden_compra_file"       // Archivo de orden de compra
    );

    e.next();
  }, "cotizaciones");
})();


