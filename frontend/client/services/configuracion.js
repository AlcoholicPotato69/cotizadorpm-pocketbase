/**
 * =============================================================================
 * configuracion.js — Servicio CRUD para la colección "configuracion"
 * =============================================================================
 * Servicio estándar generado con createCrudService().
 * Provee: list(), get(), create(), update(), remove().
 *
 * Colección "configuracion" almacena pares clave-valor para la configuración
 * del sistema. Claves conocidas:
 * - premontaje_pct: Porcentaje del precio base para días de premontaje
 * - hora_extra_cfg: Configuración de horas extra { mode: "fixed"|"percent", value }
 * - pdf_letterhead_path: Ruta del membrete para generación de PDF
 *
 * Expuesto en: window.PB_SERVICES.configuracion
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.configuracion) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.configuracion = window.PBServicesShared.createCrudService("configuracion");
})();
