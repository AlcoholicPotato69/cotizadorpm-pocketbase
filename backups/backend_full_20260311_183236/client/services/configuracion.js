/* Native PocketBase service: configuracion */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.configuracion) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.configuracion = window.PBServicesShared.createCrudService("configuracion");
})();
