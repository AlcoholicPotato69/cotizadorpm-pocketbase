(function () {
  function getLocalIcsLib() {
    function arr(v) {
      if (v === null || v === undefined || v === "") return [];
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    }

    function obj(v) {
      if (v === null || v === undefined || v === "") return {};
      if (typeof v === "object" && !Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
          return {};
        }
      }
      return {};
    }

    function pad(n) {
      return String(n).padStart(2, "0");
    }

    function normalizeDate(v) {
      const s = String(v || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return "";
      return s.slice(0, 10);
    }

    function dateObj(ds) {
      const s = normalizeDate(ds);
      if (!s) return null;
      const d = new Date(s + "T00:00:00Z");
      return isNaN(d.getTime()) ? null : d;
    }

    function toDateString(d) {
      return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
    }

    function addDays(ds, delta) {
      const d = dateObj(ds);
      if (!d) return "";
      d.setUTCDate(d.getUTCDate() + delta);
      return toDateString(d);
    }

    function listDatesBetween(start, end) {
      const s = dateObj(start);
      const e = dateObj(end || start);
      if (!s || !e || e < s) return [];
      const out = [];
      const cur = new Date(s.getTime());
      while (cur <= e) {
        out.push(toDateString(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return out;
    }

    function uniqueSorted(list) {
      const map = {};
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const v = String(list[i] || "");
        if (!v || map[v]) continue;
        map[v] = true;
        out.push(v);
      }
      out.sort();
      return out;
    }

    function escapeIcsText(v) {
      return String(v || "")
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    }

    function toIcsDate(ds) {
      return normalizeDate(ds).replace(/-/g, "");
    }

    function toIcsTimestamp(value) {
      if (!value) return "";
      const d = value instanceof Date ? value : new Date(String(value));
      if (isNaN(d.getTime())) return "";
      return (
        d.getUTCFullYear()
        + pad(d.getUTCMonth() + 1)
        + pad(d.getUTCDate())
        + "T"
        + pad(d.getUTCHours())
        + pad(d.getUTCMinutes())
        + pad(d.getUTCSeconds())
        + "Z"
      );
    }

    function foldIcsLine(line) {
      const text = String(line || "");
      if (text.length <= 74) return [text];
      const out = [];
      let rest = text;
      while (rest.length > 74) {
        out.push(rest.slice(0, 74));
        rest = " " + rest.slice(74);
      }
      out.push(rest);
      return out;
    }

    function pushIcsLine(lines, line) {
      const folded = foldIcsLine(line);
      for (let i = 0; i < folded.length; i++) lines.push(folded[i]);
    }

    function splitRanges(dates) {
      const sorted = uniqueSorted(dates);
      if (!sorted.length) return [];
      const out = [];
      let start = sorted[0];
      let prev = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        if (current === addDays(prev, 1)) {
          prev = current;
          continue;
        }
        out.push({ start: start, end: prev });
        start = current;
        prev = current;
      }
      out.push({ start: start, end: prev });
      return out;
    }

    function getOrderEntries(data) {
      const details = arr(data.espacios_detalle);
      if (details.length) {
        const out = [];
        for (let i = 0; i < details.length; i++) {
          const d = obj(details[i]);
          const sid = String(d.espacio_id || d.space_id || data.espacio_id || "").trim();
          const start = normalizeDate(d.fecha_inicio || data.fecha_inicio);
          const end = normalizeDate(d.fecha_fin || d.fecha_inicio || data.fecha_fin || data.fecha_inicio);
          if (sid && start && end) {
            out.push({ spaceId: sid, start: start, end: end, detail: d, detailIndex: i });
          }
        }
        return out;
      }
      const sid = String(data.espacio_id || "").trim();
      const start = normalizeDate(data.fecha_inicio);
      const end = normalizeDate(data.fecha_fin || data.fecha_inicio);
      return sid && start && end ? [{ spaceId: sid, start: start, end: end, detail: null, detailIndex: -1 }] : [];
    }

    function getCpReserveDates(data) {
      const entries = getOrderEntries(data);
      const out = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const sid = entry.spaceId;
        const baseDates = listDatesBetween(entry.start, entry.end);
        for (let j = 0; j < baseDates.length; j++) {
          out.push({ espacio_id: sid, fecha: baseDates[j], tipo: "evento" });
        }

        if (entry.detail) {
          const prem = arr(entry.detail.premontaje_fechas);
          for (let j = 0; j < prem.length; j++) {
            const ds = normalizeDate(prem[j]);
            if (ds) out.push({ espacio_id: sid, fecha: ds, tipo: "premontaje" });
          }

          const extra = arr(entry.detail.conceptos_adicionales);
          for (let j = 0; j < extra.length; j++) {
            const c = obj(extra[j]);
            if (String(c.type || "").toLowerCase() !== "b2b_montaje") continue;
            const meta = obj(c.meta);
            const dates = arr(meta.dates);
            for (let k = 0; k < dates.length; k++) {
              const ds2 = normalizeDate(dates[k]);
              if (ds2) out.push({ espacio_id: sid, fecha: ds2, tipo: "premontaje" });
            }
          }
        }
      }

      const rootConcepts = arr(data.conceptos_adicionales);
      for (let i = 0; i < rootConcepts.length; i++) {
        const c = obj(rootConcepts[i]);
        if (String(c.type || "").toLowerCase() !== "b2b_montaje") continue;
        const meta = obj(c.meta);
        const sid = String(meta.space_id || meta.espacio_id || data.espacio_id || "").trim();
        if (!sid) continue;
        const dates = arr(meta.dates);
        for (let j = 0; j < dates.length; j++) {
          const ds = normalizeDate(dates[j]);
          if (ds) out.push({ espacio_id: sid, fecha: ds, tipo: "premontaje" });
        }
      }

      return out;
    }

    function recordToCotData(record) {
      return {
        id: record.id,
        tenant: record.getString("tenant"),
        status: record.getString("status"),
        espacio_id: record.get("espacio_id"),
        fecha_inicio: normalizeDate(record.getString("fecha_inicio")),
        fecha_fin: normalizeDate(record.getString("fecha_fin")),
        espacios_detalle: record.get("espacios_detalle"),
        conceptos_adicionales: record.get("conceptos_adicionales"),
        cliente_nombre: record.getString("cliente_nombre"),
        nombre_cotizacion: record.getString("nombre_cotizacion"),
        detalles_evento: record.get("detalles_evento"),
        espacio_nombre: record.getString("espacio_nombre"),
        numero_orden: record.getString("numero_orden"),
        created: String(record.created || ""),
        updated: String(record.updated || "")
      };
    }

    return {
      arr: arr,
      obj: obj,
      addDays: addDays,
      escapeIcsText: escapeIcsText,
      toIcsDate: toIcsDate,
      toIcsTimestamp: toIcsTimestamp,
      pushIcsLine: pushIcsLine,
      splitRanges: splitRanges,
      getOrderEntries: getOrderEntries,
      getCpReserveDates: getCpReserveDates,
      recordToCotData: recordToCotData
    };
  }

  routerAdd("GET", "/api/cotizador/cp-calendar-ics", function (e) {
    const query = e.request.url.query();
    const token = String(query.get("token") || "");
    const expected = String($os.getenv("CP_CALENDAR_ICS_TOKEN") || "");
    if (expected && token !== expected) {
      throw new UnauthorizedError("Token invalido");
    }
    const downloadRaw = String(query.get("download") || query.get("dl") || "").toLowerCase();
    const forceDownload = downloadRaw === "1" || downloadRaw === "true" || downloadRaw === "si" || downloadRaw === "yes";

    const lib = globalThis.CotizadorLib || getLocalIcsLib();

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

    const spaceById = {};
    for (let i = 0; i < spaces.length; i++) {
      const sid = String(spaces[i].id || "").trim();
      if (sid) spaceById[sid] = spaces[i].getString("nombre");
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
        const spaceName = spaceById[String(entry.spaceId)] || String(entry.detail && entry.detail.espacio_nombre || data.espacio_nombre || ("Espacio " + entry.spaceId));
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
    e.response.header().set("X-Content-Type-Options", "nosniff");
    e.response.header().set("X-Frame-Options", "DENY");
    if (forceDownload) {
      e.response.header().set("Content-Disposition", 'attachment; filename="casa-de-piedra-calendario.ics"');
    }
    return e.string(200, body);
  });
})();
