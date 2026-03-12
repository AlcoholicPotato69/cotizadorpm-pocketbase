/* Native PocketBase service: cotizaciones */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.cotizaciones) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

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
  window.PB_SERVICES.cotizaciones = {
    list: crud.list,
    get: crud.get,
    remove: crud.remove,
    async create(payload, options) {
      return crud.create(normalizePayload(payload), options);
    },
    async update(id, payload, options) {
      return crud.update(id, normalizePayload(payload), options);
    }
  };
})();
