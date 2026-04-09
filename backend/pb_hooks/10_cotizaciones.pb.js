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


