/**
 * =============================================================================
 * impuestos.js — Servicio CRUD para la colección "impuestos"
 * =============================================================================
 * Servicio estándar generado con createCrudService().
 * Provee: list(), get(), create(), update(), remove().
 *
 * Colección "impuestos" almacena los tipos de impuesto configurables:
 * - nombre: Nombre del impuesto (ej: "IVA", "ISR")
 * - porcentaje: Porcentaje del impuesto (ej: 16 para IVA)
 * - activo: Si está habilitado para cálculos
 * - tenant: plaza_mayor | casa_de_piedra
 *
 * Expuesto en: window.PB_SERVICES.impuestos
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.impuestos) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.impuestos = window.PBServicesShared.createCrudService("impuestos");
})();
