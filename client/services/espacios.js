/**
 * =============================================================================
 * espacios.js — Servicio CRUD para la colección "espacios"
 * =============================================================================
 * Servicio estándar generado con createCrudService().
 * Provee: list(), get(), create(), update(), remove().
 *
 * Colección "espacios" almacena los salones/espacios disponibles:
 * - nombre: Nombre del espacio (ej: "Salón Principal")
 * - clave: Clave única del espacio
 * - tipo: Tipo de espacio (ej: "Salón", "Jardín", "Terraza")
 * - descripcion: Descripción del espacio
 * - precio_base: Precio base mensual (PM) o por evento (CP)
 * - precios_por_dia: JSONB con tarifas por rango de personas y día de semana
 * - etiquetas: Array de etiquetas para filtrado
 * - imagen: Array de archivos de imagen (max 5)
 * - imagen_url: URL de imagen legacy
 * - imagen_principal: Índice de la imagen principal
 * - config_b2b: JSONB con configuración B2B (horarios, precio hora extra)
 * - dias_bloqueados: Array de días de la semana bloqueados
 * - tenant: plaza_mayor | casa_de_piedra
 *
 * Expuesto en: window.PB_SERVICES.espacios
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.espacios) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.espacios = window.PBServicesShared.createCrudService("espacios");
})();
