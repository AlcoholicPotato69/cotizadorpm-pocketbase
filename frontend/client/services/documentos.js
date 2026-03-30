/**
 * =============================================================================
 * documentos.js - Servicio CRUD para la coleccion "documentos"
 * =============================================================================
 * Enfoque nativo PocketBase: sin traducciones de campos.
 *
 * Expuesto en: window.PB_SERVICES.documentos
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.documentos) return;
  if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");

  const crud = window.PBServicesShared.createCrudService("documentos");

  async function findByPath(path, options) {
    const safePath = String(path || "").trim();
    if (!safePath) return null;
    const result = await crud.list(
      { perPage: 1, filter: 'ruta = "' + safePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' },
      options
    );
    return (result.items && result.items[0]) || null;
  }

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
    findByPath: findByPath,

    async upload(payload, options) {
      const data = Object.assign({}, payload || {});
      if (!data.file) throw new Error("Archivo requerido.");
      const form = new FormData();
      form.append("tipo", data.tipo || "otro");
      if (data.nombre_original) form.append("nombre_original", data.nombre_original);
      if (data.ruta) form.append("ruta", data.ruta);
      if (data.cotizacion_id) form.append("cotizacion_id", data.cotizacion_id);
      form.append("archivo", data.file, data.file.name || "archivo.bin");
      return crud.create(form, options);
    },

    async createSignedUrlFromPath(path, options) {
      const record = await findByPath(path, options);
      if (!record) throw new Error("Documento no encontrado.");
      return createSignedUrlFromRecord(record, options);
    },
    createSignedUrlFromRecord: createSignedUrlFromRecord
  };
})();

