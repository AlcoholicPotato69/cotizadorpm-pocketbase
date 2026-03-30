/**
 * =============================================================================
 * conceptos.js — Servicio CRUD para la colección "conceptos_catalogo"
 * =============================================================================
 * Servicio estándar generado con createCrudService().
 * Provee: list(), get(), create(), update(), remove().
 *
 * Colección "conceptos_catalogo" almacena servicios adicionales que se pueden
 * agregar a una cotización (ej: servicio de audio, catering, decoración):
 * - nombre: Nombre del concepto/servicio
 * - precio_sugerido: Precio base sugerido
 * - activo: Si está disponible para selección
 * - tenant: plaza_mayor | casa_de_piedra
 *
 * Expuesto en: window.PB_SERVICES.conceptos
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.conceptos) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.conceptos = window.PBServicesShared.createCrudService("conceptos_catalogo");
})();
