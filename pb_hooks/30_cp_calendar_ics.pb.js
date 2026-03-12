(function () {
  routerAdd("GET", "/api/cotizador/cp-calendar-ics", function (e) {
    const token = String(e.request.url.query().get("token") || "");
    const expected = String($os.getenv("CP_CALENDAR_ICS_TOKEN") || "");
    if (expected && token !== expected) {
      throw new UnauthorizedError("Token inválido");
    }

    const lib = globalThis.CotizadorLib;
    if (!lib) throw new BadRequestError("CotizadorLib no esta disponible.");

    const orders = $app.findRecordsByFilter(
      "cotizaciones",
      'tenant = "casa_de_piedra" && (status = "aprobada" || status = "finalizada")',
      "-updated",
      5000,
      0
    );
    const spaces = $app.findRecordsByFilter(
      "espacios",
      'tenant = "casa_de_piedra"',
      "nombre",
      5000,
      0
    );

    const spaceByLegacy = {};
    for (let i = 0; i < spaces.length; i++) {
      const legacy = Number(spaces[i].get("legacy_id") || 0);
      if (legacy) {
        spaceByLegacy[String(legacy)] = spaces[i].getString("nombre");
      }
    }

    const nowStamp = lib.toIcsTimestamp(new Date());

    const lines = [];
    lib.pushIcsLine(lines, "BEGIN:VCALENDAR");
    lib.pushIcsLine(lines, "VERSION:2.0");
    lib.pushIcsLine(lines, "PRODID:-//Cotizador//Casa de Piedra//ES");
    lib.pushIcsLine(lines, "CALSCALE:GREGORIAN");
    lib.pushIcsLine(lines, "METHOD:PUBLISH");
    lib.pushIcsLine(lines, "X-WR-CALNAME:Casa de Piedra - Agenda y Premontajes");
    lib.pushIcsLine(lines, "X-PUBLISHED-TTL:PT2M");

    for (let i = 0; i < orders.length; i++) {
      const record = orders[i];
      const data = lib.recordToCotData(record);
      const detailsEvent = lib.obj(data.detalles_evento);
      const client = String(data.cliente_nombre || "Cliente").trim();
      const quote = String(data.nombre_cotizacion || detailsEvent.nombre_cotizacion || "").trim();
      const suffix = quote ? quote + " - " + client : client;
      const folio = String(data.numero_orden || record.id || "").trim();
      const status = String(data.status || "aprobada").toLowerCase();
      const statusLabel = status === "finalizada" ? "finalizada" : "aprobada";
      const modified = lib.toIcsTimestamp(data.updated || data.created) || nowStamp;
      const reserveDates = lib.getCpReserveDates(data);
      const premDatesBySpace = {};
      for (let k = 0; k < reserveDates.length; k++) {
        const item = reserveDates[k];
        if (String(item.tipo) !== "premontaje") continue;
        const key = String(item.espacio_id || "");
        if (!key) continue;
        if (!premDatesBySpace[key]) premDatesBySpace[key] = [];
        premDatesBySpace[key].push(item.fecha);
      }
      const entries = lib.getOrderEntries(data);

      for (let j = 0; j < entries.length; j++) {
        const entry = entries[j];
        const detailIndex = Number(entry.detailIndex);
        const detailKey = detailIndex >= 0 ? detailIndex : j;
        const spaceName = spaceByLegacy[String(entry.spaceId)] || String(entry.detail && entry.detail.espacio_nombre || data.espacio_nombre || ("Espacio " + entry.spaceId));
        const eventUid = "ev-" + record.id + "-" + entry.spaceId + "-" + detailKey + "@casadepiedra";
        const eventEndExclusive = lib.addDays(entry.end, 1);
        const eventDescription =
          "Tipo: Evento. Estatus: " + statusLabel + ". "
          + "Folio: " + (folio || "N/D") + ". "
          + "Espacio: " + spaceName + ". "
          + "Cliente: " + client + ". "
          + "Cotizacion: " + (quote || "Sin nombre") + ".";

        lib.pushIcsLine(lines, "BEGIN:VEVENT");
        lib.pushIcsLine(lines, "UID:" + lib.escapeIcsText(eventUid));
        lib.pushIcsLine(lines, "DTSTAMP:" + nowStamp);
        lib.pushIcsLine(lines, "LAST-MODIFIED:" + modified);
        lib.pushIcsLine(lines, "DTSTART;VALUE=DATE:" + lib.toIcsDate(entry.start));
        lib.pushIcsLine(lines, "DTEND;VALUE=DATE:" + lib.toIcsDate(eventEndExclusive));
        lib.pushIcsLine(lines, "SUMMARY:" + lib.escapeIcsText(spaceName + " - " + suffix));
        lib.pushIcsLine(lines, "DESCRIPTION:" + lib.escapeIcsText(eventDescription));
        lib.pushIcsLine(lines, "LOCATION:" + lib.escapeIcsText(spaceName));
        lib.pushIcsLine(lines, "STATUS:CONFIRMED");
        lib.pushIcsLine(lines, "CATEGORIES:EVENTO");
        lib.pushIcsLine(lines, "END:VEVENT");

        const ranges = lib.splitRanges(premDatesBySpace[String(entry.spaceId)] || []);
        for (let k = 0; k < ranges.length; k++) {
          const premUid = "pm-" + record.id + "-" + entry.spaceId + "-" + detailKey + "-" + k + "@casadepiedra";
          const premEndExclusive = lib.addDays(ranges[k].end, 1);
          const premDescription =
            "Tipo: Premontaje. Estatus: " + statusLabel + ". "
            + "Folio: " + (folio || "N/D") + ". "
            + "Espacio: " + spaceName + ". "
            + "Cliente: " + client + ". "
            + "Cotizacion: " + (quote || "Sin nombre") + ".";

          lib.pushIcsLine(lines, "BEGIN:VEVENT");
          lib.pushIcsLine(lines, "UID:" + lib.escapeIcsText(premUid));
          lib.pushIcsLine(lines, "DTSTAMP:" + nowStamp);
          lib.pushIcsLine(lines, "LAST-MODIFIED:" + modified);
          lib.pushIcsLine(lines, "DTSTART;VALUE=DATE:" + lib.toIcsDate(ranges[k].start));
          lib.pushIcsLine(lines, "DTEND;VALUE=DATE:" + lib.toIcsDate(premEndExclusive));
          lib.pushIcsLine(lines, "SUMMARY:" + lib.escapeIcsText(spaceName + " - PREMONTAJE - " + suffix));
          lib.pushIcsLine(lines, "DESCRIPTION:" + lib.escapeIcsText(premDescription));
          lib.pushIcsLine(lines, "LOCATION:" + lib.escapeIcsText(spaceName));
          lib.pushIcsLine(lines, "STATUS:CONFIRMED");
          lib.pushIcsLine(lines, "CATEGORIES:PREMONTAJE");
          lib.pushIcsLine(lines, "END:VEVENT");
        }
      }
    }

    lib.pushIcsLine(lines, "END:VCALENDAR");
    const body = lines.join("\r\n") + "\r\n";
    e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
    e.response.header().set("Cache-Control", "public, max-age=120");
    e.response.header().set("X-ICS-Generated-At", nowStamp);
    return e.string(200, body);
  });
})();
