(function () {
  function normalizeTenant(v) {
    const tenant = String(v || "").trim().toLowerCase();
    return (tenant === "plaza_mayor" || tenant === "casa_de_piedra") ? tenant : "";
  }

  function normalizeSpaceId(v) {
    return String(v || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  }

  function normalizeDate(v) {
    const value = String(v || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  }

  function arr(v) {
    if (!v) return [];
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
    if (!v) return {};
    if (typeof v === "object") return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }
    return {};
  }

  function addDate(set, value) {
    const date = normalizeDate(value);
    if (date) set[date] = true;
  }

  function addRange(set, start, end) {
    const startDate = normalizeDate(start);
    const endDate = normalizeDate(end || start);
    if (!startDate || !endDate || endDate < startDate) return;
    for (let cursor = new Date(startDate + "T00:00:00"), limit = new Date(endDate + "T00:00:00"); cursor <= limit; cursor.setDate(cursor.getDate() + 1)) {
      const iso = cursor.toISOString().slice(0, 10);
      if (iso) set[iso] = true;
    }
  }

  function recordToQuoteData(record) {
    return {
      espacio_id: String(record.get("espacio_id") || "").trim(),
      fecha_inicio: normalizeDate(record.getString("fecha_inicio")),
      fecha_fin: normalizeDate(record.getString("fecha_fin")),
      espacios_detalle: record.get("espacios_detalle"),
      conceptos_adicionales: record.get("conceptos_adicionales")
    };
  }

  function collectPmDates(records, spaceId) {
    const dates = {};
    for (let i = 0; i < records.length; i++) {
      const data = recordToQuoteData(records[i]);
      if (data.espacio_id !== spaceId) continue;
      addRange(dates, data.fecha_inicio, data.fecha_fin);
    }
    return Object.keys(dates).sort();
  }

  function collectCpDates(records, spaceId) {
    const dates = {};

    function addMontajeDates(concepts, fallbackSpaceId) {
      const list = arr(concepts);
      for (let i = 0; i < list.length; i++) {
        const concept = obj(list[i]);
        if (String(concept.type || "").toLowerCase() !== "b2b_montaje") continue;
        const meta = obj(concept.meta);
        const conceptSpaceId = String(meta.space_id || meta.espacio_id || fallbackSpaceId || "").trim();
        if (conceptSpaceId !== spaceId) continue;
        const conceptDates = arr(meta.dates);
        for (let j = 0; j < conceptDates.length; j++) addDate(dates, conceptDates[j]);
      }
    }

    for (let i = 0; i < records.length; i++) {
      const data = recordToQuoteData(records[i]);
      const details = arr(data.espacios_detalle);
      let matchedByDetail = false;

      for (let j = 0; j < details.length; j++) {
        const detail = obj(details[j]);
        const detailSpaceId = String(detail.espacio_id || detail.space_id || "").trim();
        if (detailSpaceId !== spaceId) continue;
        matchedByDetail = true;
        addRange(dates, detail.fecha_inicio, detail.fecha_fin);
        arr(detail.premontaje_fechas).forEach(function (value) { addDate(dates, value); });
        addMontajeDates(detail.conceptos_adicionales, detailSpaceId);
      }

      if (!matchedByDetail && data.espacio_id === spaceId) {
        addRange(dates, data.fecha_inicio, data.fecha_fin);
        addMontajeDates(data.conceptos_adicionales, data.espacio_id);
      }
    }

    return Object.keys(dates).sort();
  }

  function buildAvailability(tenant, spaceId, records) {
    const dates = tenant === "plaza_mayor"
      ? collectPmDates(records, spaceId)
      : collectCpDates(records, spaceId);
    return { tenant: tenant, spaceId: spaceId, dates: dates };
  }

  module.exports = {
    normalizeTenant: normalizeTenant,
    normalizeSpaceId: normalizeSpaceId,
    buildAvailability: buildAvailability
  };
})();
