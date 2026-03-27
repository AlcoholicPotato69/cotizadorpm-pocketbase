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

  /** Tenants válidos del sistema (whitelist). */
  var VALID_TENANTS = { plaza_mayor: true, casa_de_piedra: true };

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
      if (!tenant || !VALID_TENANTS[tenant]) {
        throw new BadRequestError("El campo tenant es obligatorio y debe ser un valor válido.");
      }
      e.record.set("tenant", tenant);

      // Sanitizar nombre del cliente (max 200 chars, sin HTML)
      var clienteNombre = sanitizeText(e.record.getString("cliente_nombre"), 200);
      if (clienteNombre) e.record.set("cliente_nombre", clienteNombre);

      // Validar formato de email (RFC básico, max 254 chars)
      var clienteEmail = String(e.record.getString("cliente_email") || "").trim();
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

      var clienteContacto = sanitizeText(e.record.getString("cliente_contacto"), 200);
      if (clienteContacto) e.record.set("cliente_contacto", clienteContacto);

      // Limpiar campos financieros/sensibles que NO deben venir del público
      e.record.set("numero_orden", "");
      e.record.set("numero_contrato", "");
      e.record.set("factura_pdf_url", "");
      e.record.set("factura_xml_url", "");
      e.record.set("contrato_url", "");
      e.record.set("url_cotizacion_final", "");
      e.record.set("url_orden_compra", "");
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
      "tipo_ajuste",            // Tipo de ajuste de precio
      "valor_ajuste",           // Valor del ajuste
      "ajuste_es_porcentaje",   // Si el ajuste es porcentual
      "desglose_impuestos",     // Detalle de impuestos aplicados
      "historial_pagos",        // Historial de pagos recibidos
      "datos_factura",          // Datos de la factura generada
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


