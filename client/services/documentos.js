/**
 * =============================================================================
 * documentos.js — Servicio CRUD para la colección "documentos"
 * =============================================================================
 * Extiende el CRUD genérico con:
 * - upload(): Sube archivos usando FormData (contratos, facturas, recibos).
 * - findByLegacyPath(): Busca un documento por su ruta legacy (migración).
 * - createSignedUrlFromRecord(): Genera URL firmada temporal para descargar archivo.
 * - createSignedUrlFromPath(): Busca por ruta legacy y genera URL firmada.
 *
 * Expuesto en: window.PB_SERVICES.documentos
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.documentos) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  const crud = window.PBServicesShared.createCrudService("documentos");

  /**
   * Busca un documento por su ruta del sistema legacy.
   * Usado durante migración para encontrar documentos importados.
   * @param {string} path - Ruta legacy del archivo
   * @param {Object} options - Opciones del cliente (tenant, etc.)
   * @returns {Object|null} Registro del documento o null si no se encuentra
   */
  async function findByLegacyPath(path, options) {
    const safePath = String(path || "").trim();
    if (!safePath) return null;
    const result = await crud.list(
      { perPage: 1, filter: 'ruta_legacy = "' + safePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' },
      options
    );
    return (result.items && result.items[0]) || null;
  }

  /**
   * Genera una URL firmada temporal (1 hora) para descargar un archivo.
   * @param {Object} record - Registro de PocketBase con campo `archivo`
   * @param {Object} options - Opciones del cliente
   * @returns {string} URL firmada para descarga directa
   * @throws {Error} Si el registro no tiene archivo adjunto
   */
  async function createSignedUrlFromRecord(record, options) {
    const raw = record || {};
    const file = Array.isArray(raw.archivo) ? raw.archivo[0] : raw.archivo;
    if (!raw.id || !file) throw new Error("Documento sin archivo.");
    const client = window.PBServicesShared.getClient(options || {});
    return client.createSignedFileUrl("documentos", raw.id, file, 3600);
  }

  window.PB_SERVICES.documentos = {
    list: crud.list,
    get: crud.get,
    create: crud.create,
    update: crud.update,
    remove: crud.remove,
    findByLegacyPath: findByLegacyPath,

    /**
     * Sube un archivo como documento nuevo.
     * Construye un FormData con los campos requeridos y el archivo.
     * @param {Object} payload - Datos: { file: File, tipo, nombre_original, ruta_legacy, cotizacion_legacy_id }
     * @param {Object} options - Opciones del cliente
     * @returns {Object} Registro creado
     * @throws {Error} Si no se proporciona un archivo
     */
    async upload(payload, options) {
      const data = Object.assign({}, payload || {});
      if (!data.file) throw new Error("Archivo requerido.");
      const form = new FormData();
      form.append("tipo", data.tipo || "otro");
      if (data.nombre_original) form.append("nombre_original", data.nombre_original);
      if (data.ruta_legacy) form.append("ruta_legacy", data.ruta_legacy);
      if (data.cotizacion_legacy_id) form.append("cotizacion_legacy_id", data.cotizacion_legacy_id);
      form.append("archivo", data.file, data.file.name || "archivo.bin");
      return crud.create(form, options);
    },

    /**
     * Busca un documento por ruta legacy y genera URL firmada para descargarlo.
     * @param {string} path - Ruta legacy del archivo
     * @param {Object} options - Opciones del cliente
     * @returns {string} URL firmada
     * @throws {Error} Si no se encuentra el documento
     */
    async createSignedUrlFromPath(path, options) {
      const record = await findByLegacyPath(path, options);
      if (!record) throw new Error("Documento no encontrado.");
      return createSignedUrlFromRecord(record, options);
    },
    createSignedUrlFromRecord: createSignedUrlFromRecord
  };
})();

