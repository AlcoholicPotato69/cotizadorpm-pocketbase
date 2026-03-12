(function () {
  onRecordCreateRequest(function (e) {
    if (e.hasSuperuserAuth && e.hasSuperuserAuth()) {
      return e.next();
    }

    if (!e.auth) {
      e.record.set("status", "pendiente");
      if (!e.record.get("tenant")) {
        throw new BadRequestError("El campo tenant es obligatorio en cotizaciones públicas.");
      }
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

  onRecordUpdateRequest(function (e) {
    if (e.hasSuperuserAuth && e.hasSuperuserAuth()) {
      return e.next();
    }
    e.next();
  }, "cotizaciones");

  onRecordEnrich(function (e) {
    if (e.requestInfo && e.requestInfo.auth) {
      return e.next();
    }

    e.record.hide(
      "precio_final",
      "desglose_precios",
      "cliente_rfc",
      "cliente_contacto",
      "cliente_email",
      "cliente_telefono",
      "numero_orden",
      "numero_contrato",
      "factura_pdf_url",
      "factura_xml_url",
      "contrato_url",
      "url_cotizacion_final",
      "url_orden_compra",
      "datos_fiscales",
      "conceptos_adicionales",
      "tipo_ajuste",
      "valor_ajuste",
      "ajuste_es_porcentaje",
      "desglose_impuestos",
      "historial_pagos",
      "datos_factura",
      "cliente_legacy_id",
      "factura_pdf_file",
      "factura_xml_file",
      "contrato_file",
      "cotizacion_final_file",
      "orden_compra_file"
    );

    e.next();
  }, "cotizaciones");
})();
