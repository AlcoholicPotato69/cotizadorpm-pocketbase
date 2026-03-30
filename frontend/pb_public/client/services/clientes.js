/**
 * =============================================================================
 * clientes.js — Servicio CRUD para la colección "clientes"
 * =============================================================================
 * Servicio estándar generado con createCrudService().
 * Provee: list(), get(), create(), update(), remove().
 *
 * Colección "clientes" almacena:
 * - nombre: Nombre del cliente o empresa
 * - rfc: RFC fiscal
 * - contacto: Persona de contacto
 * - email: Correo electrónico
 * - telefono: Teléfono
 * - tenant: plaza_mayor | casa_de_piedra
 *
 * Expuesto en: window.PB_SERVICES.clientes
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.clientes) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  window.PB_SERVICES.clientes = window.PBServicesShared.createCrudService("clientes");
})();
