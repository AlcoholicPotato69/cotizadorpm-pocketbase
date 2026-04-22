/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const findCollection = (name) => {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  };

  const getField = (collection, name) => {
    if (!collection) return null;
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  const ensureFileField = (collection, name, opts) => {
    let field = getField(collection, name);
    if (!field) {
      field = new FileField({
        name,
        required: false,
        maxSelect: 1,
        maxSize: opts.maxSize,
        mimeTypes: opts.mimeTypes,
        thumbs: null,
        protected: false
      });
      collection.fields.add(field);
    }
    field.required = false;
    field.maxSelect = 1;
    field.maxSize = opts.maxSize;
    field.mimeTypes = opts.mimeTypes;
    field.thumbs = null;
    field.protected = false;
    return field;
  };

  const tenantScopedRead = [
    '(activo = true)',
    '|| (',
    '  @request.auth.id != ""',
    '  && (',
    '    @request.auth.role = "admin"',
    '    || @request.auth.role = "verificador"',
    '    || @request.auth.allowed_tenants ?= tenant',
    '    || @request.auth.tenant_default = tenant',
    '    || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '    || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    '  )',
    ')'
  ].join(" ");

  const adminVerifierWrite = [
    '@request.auth.id != ""',
    '&& (@request.auth.role = "admin" || @request.auth.role = "verificador")'
  ].join(" ");

  const espacios = findCollection("espacios");
  if (!espacios) return;
  ensureFileField(espacios, "plano_geografico", {
    maxSize: 26214400,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml"
    ]
  });
  espacios.listRule = tenantScopedRead;
  espacios.viewRule = tenantScopedRead;
  espacios.createRule = adminVerifierWrite;
  espacios.updateRule = adminVerifierWrite;
  espacios.deleteRule = adminVerifierWrite;
  app.save(espacios);
}, (_app) => {
  // No-op: no se revierte para evitar volver a bloquear planos o verificadores.
});
