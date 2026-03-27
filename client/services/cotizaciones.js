/**
 * =============================================================================
 * cotizaciones.js - Servicio CRUD para la coleccion "cotizaciones"
 * =============================================================================
 * Enfoque nativo PocketBase: no traduce ni renombra campos.
 *
 * Expuesto en: window.PB_SERVICES.cotizaciones
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.cotizaciones) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  function buildNativeQuoteFolio(record) {
    const current = String((record && record.numero_orden) || "").trim();
    if (current) return current;
    const tenant = String((record && record.tenant) || "").trim().toLowerCase();
    const prefix = tenant === "casa_de_piedra" ? "CP" : (tenant === "plaza_mayor" ? "PM" : "COT");
    const nativeId = String((record && record.id) || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const shortId = nativeId.slice(0, 6) || "PEND";
    return prefix + "-" + shortId;
  }

  const crud = window.PBServicesShared.createCrudService("cotizaciones");

  window.PB_SERVICES.cotizaciones = {
    list: crud.list,
    get: crud.get,
    remove: crud.remove,
    async create(payload, options) {
      const created = await crud.create(payload, options);
      const folio = buildNativeQuoteFolio(created);
      if (created && !String(created.numero_orden || "").trim() && String(created.id || "").trim()) {
        try {
          await crud.update(created.id, { numero_orden: folio }, options);
          created.numero_orden = folio;
        } catch (_) {}
      }
      return created;
    },
    async update(id, payload, options) {
      return crud.update(id, payload, options);
    }
  };
})();
