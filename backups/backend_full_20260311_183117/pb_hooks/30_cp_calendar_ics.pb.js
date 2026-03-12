(function () {
  routerAdd("GET", "/api/cotizador/cp-calendar-ics", function (e) {
    const token = String(e.request.url.query().get("token") || "");
    const expected = String($os.getenv("CP_CALENDAR_ICS_TOKEN") || "");
    if (expected && token !== expected) {
      throw new UnauthorizedError("Token inválido");
    }

    const lib = globalThis.CotizadorLib;
    const orders = $app.findRecordsByFilter(
      "cotizaciones",
      'tenant = "casa_de_piedra" && (status = "aprobada" || status = "finalizada")',
      "fecha_inicio",
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

    const now = new Date();
    const stamp = now.getUTCFullYear()
      + String(now.getUTCMonth() + 1).padStart(2, "0")
      + String(now.getUTCDate()).padStart(2, "0")
      + "T"
      + String(now.getUTCHours()).padStart(2, "0")
      + String(now.getUTCMinutes()).padStart(2, "0")
      + String(now.getUTCSeconds()).padStart(2, "0")
      + "Z";

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cotizador//Casa de Piedra//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Casa de Piedra - Agenda y Premontajes"
    ];

    for (let i = 0; i < orders.length; i++) {
      const data = lib.recordToCotData(orders[i]);
      const detailsEvent = lib.obj(data.detalles_evento);
      const client = String(data.cliente_nombre || "Cliente");
      const quote = String(data.nombre_cotizacion || detailsEvent.nombre_cotizacion || "").trim();
      const suffix = quote ? quote + " - " + client : client;
      const entries = lib.getOrderEntries(data);

      for (let j = 0; j < entries.length; j++) {
        const entry = entries[j];
        const spaceName = spaceByLegacy[String(entry.spaceId)] || String(entry.detail && entry.detail.espacio_nombre || data.espacio_nombre || ("Espacio " + entry.spaceId));
        const eventUid = "ev-" + orders[i].id + "-" + entry.spaceId + "-" + lib.toIcsDate(entry.start) + "@casadepiedra";
        const eventEndExclusive = lib.addDays(entry.end, 1);

        lines.push(
          "BEGIN:VEVENT",
          "UID:" + lib.escapeIcsText(eventUid),
          "DTSTAMP:" + stamp,
          "DTSTART;VALUE=DATE:" + lib.toIcsDate(entry.start),
          "DTEND;VALUE=DATE:" + lib.toIcsDate(eventEndExclusive),
          "SUMMARY:" + lib.escapeIcsText(spaceName + " - " + suffix),
          "DESCRIPTION:" + lib.escapeIcsText("Evento aprobado/finalizado. Espacio: " + spaceName + ". Cliente: " + client + "."),
          "LOCATION:" + lib.escapeIcsText(spaceName),
          "CATEGORIES:EVENTO",
          "END:VEVENT"
        );

        const premDates = [];
        const fullData = lib.recordToCotData(orders[i]);
        const allDates = lib.getCpReserveDates(fullData);
        for (let k = 0; k < allDates.length; k++) {
          if (String(allDates[k].tipo) === "premontaje" && Number(allDates[k].espacio_id) === Number(entry.spaceId)) {
            premDates.push(allDates[k].fecha);
          }
        }
        const ranges = lib.splitRanges(premDates);
        for (let k = 0; k < ranges.length; k++) {
          const premUid = "pm-" + orders[i].id + "-" + entry.spaceId + "-" + lib.toIcsDate(ranges[k].start) + "@casadepiedra";
          const premEndExclusive = lib.addDays(ranges[k].end, 1);
          lines.push(
            "BEGIN:VEVENT",
            "UID:" + lib.escapeIcsText(premUid),
            "DTSTAMP:" + stamp,
            "DTSTART;VALUE=DATE:" + lib.toIcsDate(ranges[k].start),
            "DTEND;VALUE=DATE:" + lib.toIcsDate(premEndExclusive),
            "SUMMARY:" + lib.escapeIcsText(spaceName + " - PREMONTAJE - " + suffix),
            "DESCRIPTION:" + lib.escapeIcsText("Premontaje aprobado/finalizado. Espacio: " + spaceName + ". Cliente: " + client + "."),
            "LOCATION:" + lib.escapeIcsText(spaceName),
            "CATEGORIES:PREMONTAJE",
            "END:VEVENT"
          );
        }
      }
    }

    lines.push("END:VCALENDAR");
    const body = lines.join("\r\n") + "\r\n";
    e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
    e.response.header().set("Cache-Control", "public, max-age=120");
    return e.string(200, body);
  });
})();
