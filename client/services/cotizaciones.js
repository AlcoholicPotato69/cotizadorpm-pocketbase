/**
 * =============================================================================
 * cotizaciones.js — Servicio CRUD para la colección "cotizaciones"
 * =============================================================================
 * Extiende el CRUD genérico con normalización de payloads legacy.
 * Los campos `cliente_id` y `creado_por` del esquema anterior se renombran
 * a `cliente_legacy_id` y `creado_por_legacy` respectivamente.
 *
 * Expuesto en: window.PB_SERVICES.cotizaciones
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.cotizaciones) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  /**
   * Normaliza campos legacy del payload antes de enviar a PocketBase.
   * Renombra `cliente_id` → `cliente_legacy_id` y `creado_por` → `creado_por_legacy`
   * para compatibilidad con el esquema nativo de PocketBase.
   * @param {Object} payload - Datos de la cotización
   * @returns {Object} Payload normalizado (copia, no muta el original)
   */
  function normalizePayload(payload) {
    const copy = Object.assign({}, payload || {});
    if (Object.prototype.hasOwnProperty.call(copy, "cliente_id")) {
      copy.cliente_legacy_id = copy.cliente_id;
      delete copy.cliente_id;
    }
    if (Object.prototype.hasOwnProperty.call(copy, "creado_por")) {
      copy.creado_por_legacy = copy.creado_por;
      delete copy.creado_por;
    }
    return copy;
  }

  const crud = window.PBServicesShared.createCrudService("cotizaciones");

  /** Servicio de cotizaciones con normalización de payload en create/update. */
  window.PB_SERVICES.cotizaciones = {
    list: crud.list,
    get: crud.get,
    remove: crud.remove,
    /** Crea una cotización normalizando campos legacy. */
    async create(payload, options) {
      return crud.create(normalizePayload(payload), options);
    },
    /** Actualiza una cotización normalizando campos legacy. */
    async update(id, payload, options) {
      return crud.update(id, normalizePayload(payload), options);
    }
  };
})();

