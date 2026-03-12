/* Native PocketBase service: impuestos */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.impuestos) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.impuestos = window.PBServicesShared.createCrudService("impuestos");
})();
