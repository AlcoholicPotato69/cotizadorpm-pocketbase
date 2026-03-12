/* Native PocketBase service: espacios */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.espacios) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.espacios = window.PBServicesShared.createCrudService("espacios");
})();
