(function () {
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

  function firstDayOfMonth(ds) {
    const d = dateObj(ds);
    if (!d) return "";
    d.setUTCDate(1);
    return toDateString(d);
  }

  function lastDayOfMonth(ds) {
    const d = dateObj(ds);
    if (!d) return "";
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    return toDateString(d);
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

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return !(aEnd < bStart || bEnd < aStart);
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
    for (let i = 0; i < folded.length; i++) {
      lines.push(folded[i]);
    }
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

  function normalizePmRecord(record) {
    if (String(record.get("tenant") || "") !== "plaza_mayor") return;
    if (record.getBool("permanencia_personalizada")) return;

    const details = arr(record.get("espacios_detalle"));
    if (details.length) {
      const normalized = [];
      const starts = [];
      const ends = [];
      for (let i = 0; i < details.length; i++) {
        const d = obj(details[i]);
        let fi = normalizeDate(d.fecha_inicio || record.getString("fecha_inicio"));
        let ff = normalizeDate(d.fecha_fin || fi || record.getString("fecha_fin"));
        if (!fi) fi = normalizeDate(record.getString("fecha_inicio")) || toDateString(new Date());
        if (!ff) ff = fi;
        const fiNorm = firstDayOfMonth(fi);
        const ffNorm = lastDayOfMonth(ff);
        d.fecha_inicio = fiNorm;
        d.fecha_fin = ffNorm;
        normalized.push(d);
        starts.push(fiNorm);
        ends.push(ffNorm);
      }
      starts.sort();
      ends.sort();
      record.set("espacios_detalle", normalized);
      if (starts.length) record.set("fecha_inicio", starts[0]);
      if (ends.length) record.set("fecha_fin", ends[ends.length - 1]);
      return;
    }

    const fi = normalizeDate(record.getString("fecha_inicio"));
    const ff = normalizeDate(record.getString("fecha_fin"));
    if (fi) record.set("fecha_inicio", firstDayOfMonth(fi));
    if (ff) record.set("fecha_fin", lastDayOfMonth(ff));
  }

  function getOrderEntries(data) {
    const details = arr(data.espacios_detalle);
    if (details.length) {
      const out = [];
      for (let i = 0; i < details.length; i++) {
        const d = obj(details[i]);
        const sid = Number(d.espacio_id || data.espacio_id || 0);
        const start = normalizeDate(d.fecha_inicio || data.fecha_inicio);
        const end = normalizeDate(d.fecha_fin || d.fecha_inicio || data.fecha_fin || data.fecha_inicio);
        if (sid && start && end) {
          out.push({ spaceId: sid, start: start, end: end, detail: d, detailIndex: i });
        }
      }
      return out;
    }
    const sid = Number(data.espacio_id || 0);
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
      const sid = Number(meta.space_id || data.espacio_id || 0);
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

  globalThis.CotizadorLib = {
    arr: arr,
    obj: obj,
    normalizeDate: normalizeDate,
    addDays: addDays,
    listDatesBetween: listDatesBetween,
    firstDayOfMonth: firstDayOfMonth,
    lastDayOfMonth: lastDayOfMonth,
    overlaps: overlaps,
    uniqueSorted: uniqueSorted,
    escapeIcsText: escapeIcsText,
    toIcsDate: toIcsDate,
    toIcsTimestamp: toIcsTimestamp,
    foldIcsLine: foldIcsLine,
    pushIcsLine: pushIcsLine,
    splitRanges: splitRanges,
    normalizePmRecord: normalizePmRecord,
    getOrderEntries: getOrderEntries,
    getCpReserveDates: getCpReserveDates,
    recordToCotData: recordToCotData
  };
})();
