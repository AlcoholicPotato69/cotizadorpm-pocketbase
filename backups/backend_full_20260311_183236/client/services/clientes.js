/* Native PocketBase service: clientes */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.clientes) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.clientes = window.PBServicesShared.createCrudService("clientes");
})();
