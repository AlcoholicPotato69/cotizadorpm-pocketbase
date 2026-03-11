(function () {
  function assertNoPmOverlap(record) {
    const lib = globalThis.CotizadorLib;
    const status = String(record.get("status") || "");
    if (String(record.get("tenant") || "") !== "plaza_mayor") return;
    if (status !== "aprobada" && status !== "finalizada") return;

    const incoming = lib.recordToCotData(record);
    const incomingEntries = lib.getOrderEntries(incoming);
    if (!incomingEntries.length) return;

    const others = $app.findRecordsByFilter(
      "cotizaciones",
      'tenant = "plaza_mayor" && (status = "aprobada" || status = "finalizada") && id != {:id}',
      "",
      5000,
      0,
      { id: record.id }
    );

    for (let i = 0; i < others.length; i++) {
      const otherData = lib.recordToCotData(others[i]);
      const otherEntries = lib.getOrderEntries(otherData);
      for (let a = 0; a < incomingEntries.length; a++) {
        for (let b = 0; b < otherEntries.length; b++) {
          if (Number(incomingEntries[a].spaceId) !== Number(otherEntries[b].spaceId)) continue;
          if (lib.overlaps(incomingEntries[a].start, incomingEntries[a].end, otherEntries[b].start, otherEntries[b].end)) {
            throw new BadRequestError("Conflicto de agenda: el espacio ya está reservado dentro del rango solicitado.");
          }
        }
      }
    }
  }

  function assertNoCpOverlap(record) {
    const lib = globalThis.CotizadorLib;
    const status = String(record.get("status") || "");
    if (String(record.get("tenant") || "") !== "casa_de_piedra") return;
    if (["pendiente", "aprobada", "finalizada"].indexOf(status) === -1) return;

    const incoming = lib.getCpReserveDates(lib.recordToCotData(record));
    if (!incoming.length) return;

    const others = $app.findRecordsByFilter(
      "cotizaciones",
      'tenant = "casa_de_piedra" && (status = "pendiente" || status = "aprobada" || status = "finalizada") && id != {:id}',
      "",
      5000,
      0,
      { id: record.id }
    );

    const seen = {};
    for (let i = 0; i < incoming.length; i++) {
      seen[String(incoming[i].espacio_id) + "|" + String(incoming[i].fecha)] = true;
    }

    for (let i = 0; i < others.length; i++) {
      const oldDates = lib.getCpReserveDates(lib.recordToCotData(others[i]));
      for (let j = 0; j < oldDates.length; j++) {
        const key = String(oldDates[j].espacio_id) + "|" + String(oldDates[j].fecha);
        if (seen[key]) {
          throw new BadRequestError("Conflicto de agenda: ya existe una reserva o premontaje en el mismo espacio y día.");
        }
      }
    }
  }

  function applyBusinessRules(record) {
    const tenant = String(record.get("tenant") || "");
    if (tenant === "plaza_mayor") {
      globalThis.CotizadorLib.normalizePmRecord(record);
      assertNoPmOverlap(record);
    }
    if (tenant === "casa_de_piedra") {
      assertNoCpOverlap(record);
    }
  }

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
    applyBusinessRules(e.record);
    e.next();
  }, "cotizaciones");

  onRecordUpdateRequest(function (e) {
    if (e.hasSuperuserAuth && e.hasSuperuserAuth()) {
      return e.next();
    }
    applyBusinessRules(e.record);
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
