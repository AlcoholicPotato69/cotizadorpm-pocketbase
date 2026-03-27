/**
 * =============================================================================
 * 00_lib.pb.js — Librería de Utilidades Server-Side
 * =============================================================================
 * Propósito: Funciones compartidas para todos los hooks de PocketBase.
 * Se carga primero (prefijo "00") y expone el objeto global CotizadorLib.
 *
 * Categorías de funciones:
 * - Parseo seguro de JSON (arr, obj)
 * - Manipulación de fechas (normalizeDate, addDays, listDatesBetween, etc.)
 * - Formato ICS/iCalendar (escapeIcsText, toIcsDate, foldIcsLine, etc.)
 * - Lógica de negocio (normalizePmRecord, getOrderEntries, getCpReserveDates)
 * =============================================================================
 */
(function () {

  // ─── PARSEO SEGURO ────────────────────────────────────────────────────────────

  /**
   * Convierte cualquier valor a un array de forma segura.
   * Soporta: arrays nativos, JSON strings que representan arrays, null/undefined.
   * @param {*} v - Valor a convertir
   * @returns {Array} Array resultante o [] si no se puede parsear
   */
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

  /**
   * Convierte cualquier valor a un objeto plano de forma segura.
   * Soporta: objetos nativos, JSON strings que representan objetos, null/undefined.
   * @param {*} v - Valor a convertir
   * @returns {Object} Objeto resultante o {} si no se puede parsear
   */
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

  // ─── UTILIDADES DE FECHA ──────────────────────────────────────────────────────

  /**
   * Rellena un número con ceros a la izquierda hasta 2 dígitos.
   * @param {number} n - Número a formatear
   * @returns {string} Ej: 5 → "05", 12 → "12"
   */
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /**
   * Normaliza cualquier formato de fecha al estándar YYYY-MM-DD.
   * Acepta fechas ISO, timestamps, etc. y retorna solo la parte de fecha.
   * @param {*} v - Valor con fecha (string, Date, etc.)
   * @returns {string} Fecha normalizada "YYYY-MM-DD" o "" si es inválida
   */
  function normalizeDate(v) {
    const s = String(v || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return "";
    return s.slice(0, 10);
  }

  /**
   * Crea un objeto Date UTC a partir de un string de fecha.
   * @param {string} ds - Fecha en formato "YYYY-MM-DD"
   * @returns {Date|null} Objeto Date en UTC o null si es inválida
   */
  function dateObj(ds) {
    const s = normalizeDate(ds);
    if (!s) return null;
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Convierte un objeto Date UTC a string "YYYY-MM-DD".
   * @param {Date} d - Objeto Date
   * @returns {string} Fecha formateada
   */
  function toDateString(d) {
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  /**
   * Suma o resta días a una fecha.
   * @param {string} ds - Fecha base en formato "YYYY-MM-DD"
   * @param {number} delta - Días a sumar (negativo para restar)
   * @returns {string} Nueva fecha "YYYY-MM-DD" o "" si la fecha base es inválida
   */
  function addDays(ds, delta) {
    const d = dateObj(ds);
    if (!d) return "";
    d.setUTCDate(d.getUTCDate() + delta);
    return toDateString(d);
  }

  /**
   * Genera una lista de todas las fechas entre dos límites (inclusive).
   * @param {string} start - Fecha inicio "YYYY-MM-DD"
   * @param {string} end - Fecha fin "YYYY-MM-DD" (default = start)
   * @returns {string[]} Array de fechas ["YYYY-MM-DD", ...]
   */
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

  /**
   * Retorna el primer día del mes de una fecha dada.
   * @param {string} ds - Fecha "YYYY-MM-DD"
   * @returns {string} Primer día del mes "YYYY-MM-01"
   */
  function firstDayOfMonth(ds) {
    const d = dateObj(ds);
    if (!d) return "";
    d.setUTCDate(1);
    return toDateString(d);
  }

  /**
   * Retorna el último día del mes de una fecha dada.
   * @param {string} ds - Fecha "YYYY-MM-DD"
   * @returns {string} Último día del mes "YYYY-MM-28/29/30/31"
   */
  function lastDayOfMonth(ds) {
    const d = dateObj(ds);
    if (!d) return "";
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    return toDateString(d);
  }

  /**
   * Deduplica y ordena alfabéticamente un array de strings.
   * @param {string[]} list - Array con posibles duplicados
   * @returns {string[]} Array único y ordenado
   */
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

  /**
   * Verifica si dos rangos de fechas se solapan.
   * @param {string} aStart - Inicio rango A
   * @param {string} aEnd - Fin rango A
   * @param {string} bStart - Inicio rango B
   * @param {string} bEnd - Fin rango B
   * @returns {boolean} true si hay solapamiento
   */
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return !(aEnd < bStart || bEnd < aStart);
  }

  // ─── FORMATO ICS (iCalendar RFC 5545) ─────────────────────────────────────────

  /**
   * Escapa caracteres especiales para texto ICS (RFC 5545).
   * Escapa: backslash, newline, coma, punto y coma.
   * @param {string} v - Texto a escapar
   * @returns {string} Texto escapado para ICS
   */
  function escapeIcsText(v) {
    return String(v || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  /**
   * Convierte fecha "YYYY-MM-DD" a formato ICS "YYYYMMDD".
   * @param {string} ds - Fecha normalizada
   * @returns {string} Fecha sin guiones para ICS
   */
  function toIcsDate(ds) {
    return normalizeDate(ds).replace(/-/g, "");
  }

  /**
   * Convierte un valor de fecha/hora a timestamp ICS UTC "YYYYMMDDTHHmmssZ".
   * @param {Date|string} value - Fecha/hora a formatear
   * @returns {string} Timestamp ICS en UTC o "" si es inválido
   */
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

  /**
   * Pliega una línea ICS a máximo 74 caracteres (RFC 5545 §3.1).
   * Las líneas de continuación empiezan con un espacio.
   * @param {string} line - Línea a plegar
   * @returns {string[]} Array de líneas plegadas
   */
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

  /**
   * Agrega una línea al buffer ICS aplicando plegado automático.
   * @param {string[]} lines - Buffer de líneas ICS
   * @param {string} line - Línea a agregar
   */
  function pushIcsLine(lines, line) {
    const folded = foldIcsLine(line);
    for (let i = 0; i < folded.length; i++) {
      lines.push(folded[i]);
    }
  }

  // ─── LÓGICA DE NEGOCIO ────────────────────────────────────────────────────────

  /**
   * Divide un array de fechas en rangos consecutivos.
   * Ej: ["2026-01-01","2026-01-02","2026-01-05"] → [{start:"2026-01-01",end:"2026-01-02"},{start:"2026-01-05",end:"2026-01-05"}]
   * @param {string[]} dates - Array de fechas "YYYY-MM-DD"
   * @returns {Array<{start:string, end:string}>} Rangos consecutivos
   */
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

  /**
   * Normaliza fechas de un registro de cotización del tenant Plaza Mayor.
   * Para PM, las fechas se ajustan al primer/último día del mes (permanencia mensual).
   * Si tiene multi-espacio (espacios_detalle), normaliza cada espacio por separado.
   * No se aplica si permanencia_personalizada es true.
   * @param {Object} record - Registro PocketBase de cotización
   */
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

  /**
   * Extrae las entradas de orden (espacio + fechas) de una cotización.
   * Soporta cotizaciones simples (un espacio) y multi-espacio (espacios_detalle).
   * @param {Object} data - Datos de cotización (objeto plano)
   * @returns {Array<{spaceId:string, start:string, end:string, detail:Object|null, detailIndex:number}>}
   */
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

  /**
   * Extrae todas las fechas reservadas de una cotización de Casa de Piedra.
   * Incluye: fechas del evento principal + premontaje + montajes B2B.
   * Usado para bloquear fechas en el calendario público.
   * @param {Object} data - Datos de cotización (objeto plano)
   * @returns {Array<{espacio_id:string, fecha:string, tipo:string}>} Lista de reservas con tipo ("evento"|"premontaje")
   */
  function getCpReserveDates(data) {
    const entries = getOrderEntries(data);
    const out = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const sid = entry.spaceId;

      // Fechas del evento principal
      const baseDates = listDatesBetween(entry.start, entry.end);
      for (let j = 0; j < baseDates.length; j++) {
        out.push({ espacio_id: sid, fecha: baseDates[j], tipo: "evento" });
      }

      // Fechas de premontaje del detalle de espacio
      if (entry.detail) {
        const prem = arr(entry.detail.premontaje_fechas);
        for (let j = 0; j < prem.length; j++) {
          const ds = normalizeDate(prem[j]);
          if (ds) out.push({ espacio_id: sid, fecha: ds, tipo: "premontaje" });
        }

        // Montajes B2B dentro del detalle
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

    // Montajes B2B a nivel raíz de la cotización
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

  /**
   * Convierte un registro PocketBase de cotización a un objeto plano normalizado.
   * Útil para procesamiento posterior sin depender de la API de PocketBase.
   * @param {Object} record - Registro PocketBase
   * @returns {Object} Objeto plano con todos los campos relevantes de la cotización
   */
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

  // ─── EXPORTAR LA LIBRERÍA ─────────────────────────────────────────────────────

  /** Objeto global con todas las utilidades compartidas del cotizador. */
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
