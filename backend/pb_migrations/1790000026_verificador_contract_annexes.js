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

  const ensureTextField = (collection, name, maxLen) => {
    let field = getField(collection, name);
    if (!field) {
      field = new TextField({
        name,
        required: false,
        max: maxLen
      });
      collection.fields.add(field);
    }
    field.required = false;
    field.max = maxLen;
    return field;
  };

  const ensureDateField = (collection, name) => {
    let field = getField(collection, name);
    if (!field) {
      field = new DateField({
        name,
        required: false,
        min: "",
        max: ""
      });
      collection.fields.add(field);
    }
    field.required = false;
    field.min = "";
    field.max = "";
    return field;
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
    if (typeof opts.protected === "boolean") field.protected = opts.protected;
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

  const tenantRead = [
    '@request.auth.id != "" && (',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(" ");

  const tenantCreate = [
    '@request.auth.id != "" && (',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= @request.body.tenant',
    '  || @request.auth.tenant_default = @request.body.tenant',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    ')'
  ].join(" ");

  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';
  const adminVerifierOnly = '@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "verificador")';

  const espacios = findCollection("espacios");
  if (espacios) {
    ensureTextField(espacios, "reglamento_template", 255);
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
    espacios.createRule = adminVerifierOnly;
    espacios.updateRule = adminVerifierOnly;
    espacios.deleteRule = adminVerifierOnly;
    app.save(espacios);
  }

  const cotizaciones = findCollection("cotizaciones");
  if (cotizaciones) {
    ensureDateField(cotizaciones, "fecha_contrato");
    app.save(cotizaciones);
  }

  const conceptos = findCollection("conceptos_catalogo");
  if (conceptos) {
    conceptos.listRule = tenantRead;
    conceptos.viewRule = tenantRead;
    conceptos.createRule = tenantCreate;
    conceptos.updateRule = tenantRead;
    conceptos.deleteRule = tenantRead;
    app.save(conceptos);
  }

  const configuracion = findCollection("configuracion");
  if (configuracion) {
    configuracion.listRule = tenantRead;
    configuracion.viewRule = tenantRead;
    configuracion.createRule = tenantCreate;
    configuracion.updateRule = tenantRead;
    configuracion.deleteRule = tenantRead;
    app.save(configuracion);
  }

  const impuestos = findCollection("impuestos");
  if (impuestos) {
    impuestos.listRule = tenantRead;
    impuestos.viewRule = tenantRead;
    impuestos.createRule = tenantCreate;
    impuestos.updateRule = tenantRead;
    impuestos.deleteRule = tenantRead;
    app.save(impuestos);
  }

  const documentos = findCollection("documentos");
  if (documentos) {
    documentos.listRule = tenantRead;
    documentos.viewRule = tenantRead;
    documentos.createRule = tenantCreate;
    documentos.updateRule = tenantRead;
    documentos.deleteRule = tenantRead;
    app.save(documentos);
  }

  const pdfOverlays = findCollection("pdf_overlays");
  if (pdfOverlays) {
    pdfOverlays.listRule = tenantRead;
    pdfOverlays.viewRule = tenantRead;
    pdfOverlays.createRule = adminVerifierOnly;
    pdfOverlays.updateRule = adminVerifierOnly;
    pdfOverlays.deleteRule = adminVerifierOnly;
    app.save(pdfOverlays);
  }

  const appUsers = findCollection("app_users");
  if (appUsers) {
    appUsers.listRule = adminOnly;
    appUsers.viewRule = adminOnly;
    appUsers.createRule = adminOnly;
    appUsers.updateRule = adminOnly;
    appUsers.deleteRule = adminOnly;
    app.save(appUsers);
  }
}, (_app) => {
  // No-op intencional: conserva campos y reglas una vez desplegados.
});
