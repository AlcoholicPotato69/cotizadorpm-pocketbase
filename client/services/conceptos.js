/* Native PocketBase service: conceptos_catalogo */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.conceptos) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.conceptos = window.PBServicesShared.createCrudService("conceptos_catalogo");
})();
