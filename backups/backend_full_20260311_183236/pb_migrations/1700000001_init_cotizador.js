migrate((app) => {
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const ROLES = ["admin", "plaza_mayor", "casa_de_piedra", "user"];
  const STATUS = ["pendiente", "aprobada", "rechazada", "finalizada"];
  const AJUSTES = ["ninguno", "porcentaje", "monto_fijo", "descuento"];
  const DOC_TYPES = ["contrato", "factura_pdf", "factura_xml", "cotizacion_final", "orden_compra", "otro"];

  const tenantRead = '@request.auth.id != "" && @request.auth.allowed_tenants ?= tenant';
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';
  const publicSpacesRead = '(activo = true) || (' + tenantRead + ')';
  const publicQuotesRead = '(' + tenantRead + ') || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))';
  const publicQuoteCreate = '(' + tenantRead + ') || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))';
  const publicCpConfigRead = '(' + tenantRead + ') || (@request.auth.id = "" && tenant = "casa_de_piedra" && clave = "premontaje_pct")';
  const publicCpConceptsRead = '(' + tenantRead + ') || (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)';

  const users = new Collection({
    type: "auth",
    name: "app_users",
    listRule: adminOnly,
    viewRule: 'id = @request.auth.id || ' + adminOnly,
    createRule: null,
    updateRule: 'id = @request.auth.id || ' + adminOnly,
    deleteRule: adminOnly,
    manageRule: adminOnly,
    fields: [
      { name: "legacy_profile_id", type: "text", required: false, hidden: true, max: 64 },
      { name: "login_username", type: "text", required: false, presentable: true, max: 120 },
      { name: "role", type: "select", required: true, maxSelect: 1, values: ROLES },
      { name: "tenant_default", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "allowed_tenants", type: "select", required: true, maxSelect: 2, values: TENANTS },
      { name: "app_metadata", type: "json", required: false },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_app_users_legacy_profile_id ON app_users (legacy_profile_id)",
      "CREATE UNIQUE INDEX idx_app_users_login_username_nocase ON app_users (LOWER(login_username))"
    ]
  });
  app.save(users);

  const clientes = new Collection({
    type: "base",
    name: "clientes",
    listRule: tenantRead,
    viewRule: tenantRead,
    createRule: tenantRead,
    updateRule: tenantRead,
    deleteRule: tenantRead,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "legacy_id", type: "text", required: false, max: 64 },
      { name: "nombre_completo", type: "text", required: true, max: 255 },
      { name: "telefono", type: "text", required: false, max: 80 },
      { name: "correo", type: "email", required: false },
      { name: "rfc", type: "text", required: false, max: 40 },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_clientes_tenant_legacy ON clientes (tenant, legacy_id)"
    ]
  });
  app.save(clientes);

  const conceptos = new Collection({
    type: "base",
    name: "conceptos_catalogo",
    listRule: publicCpConceptsRead,
    viewRule: publicCpConceptsRead,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "legacy_id", type: "number", required: false, onlyInt: true },
      { name: "nombre", type: "text", required: true, max: 255 },
      { name: "precio_sugerido", type: "number", required: false, min: 0 },
      { name: "activo", type: "bool", required: false },
      { name: "created_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_conceptos_tenant_legacy ON conceptos_catalogo (tenant, legacy_id)"
    ]
  });
  app.save(conceptos);

  const configuracion = new Collection({
    type: "base",
    name: "configuracion",
    listRule: publicCpConfigRead,
    viewRule: publicCpConfigRead,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "legacy_id", type: "number", required: false, onlyInt: true },
      { name: "clave", type: "text", required: true, max: 120 },
      { name: "valor_num", type: "number", required: false },
      { name: "valor_json", type: "json", required: false },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_configuracion_tenant_clave ON configuracion (tenant, clave)",
      "CREATE UNIQUE INDEX idx_configuracion_tenant_legacy ON configuracion (tenant, legacy_id)"
    ]
  });
  app.save(configuracion);

  const impuestos = new Collection({
    type: "base",
    name: "impuestos",
    listRule: tenantRead,
    viewRule: tenantRead,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "legacy_id", type: "number", required: false, onlyInt: true },
      { name: "nombre", type: "text", required: true, max: 120 },
      { name: "porcentaje", type: "number", required: true, min: 0 },
      { name: "activo", type: "bool", required: false },
      { name: "impuestos_aplicados", type: "json", required: false },
      { name: "created_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_impuestos_tenant_legacy ON impuestos (tenant, legacy_id)"
    ]
  });
  app.save(impuestos);

  const espacios = new Collection({
    type: "base",
    name: "espacios",
    listRule: publicSpacesRead,
    viewRule: publicSpacesRead,
    createRule: tenantRead,
    updateRule: tenantRead,
    deleteRule: tenantRead,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "legacy_id", type: "number", required: false, onlyInt: true },
      { name: "clave", type: "text", required: true, max: 80 },
      { name: "nombre", type: "text", required: true, max: 255 },
      { name: "tipo", type: "text", required: true, max: 80 },
      { name: "descripcion", type: "editor", required: false },
      { name: "requisitos", type: "editor", required: false },
      { name: "imagen_url", type: "url", required: false },
      { name: "imagen", type: "file", required: false, maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"] },
      { name: "activo", type: "bool", required: false },
      { name: "precio_base", type: "number", required: false, min: 0 },
      { name: "ajuste_tipo", type: "select", required: false, maxSelect: 1, values: AJUSTES },
      { name: "ajuste_porcentaje", type: "number", required: false },
      { name: "activa", type: "bool", required: false },
      { name: "impuestos_ids", type: "json", required: false },
      { name: "color", type: "text", required: false, max: 32 },
      { name: "etiquetas", type: "json", required: false },
      { name: "precios_por_dia", type: "json", required: false },
      { name: "dias_bloqueados", type: "json", required: false },
      { name: "config_b2b", type: "json", required: false },
      { name: "created_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_espacios_tenant_legacy ON espacios (tenant, legacy_id)",
      "CREATE INDEX idx_espacios_tenant_activo ON espacios (tenant, activo)",
      "CREATE INDEX idx_espacios_tenant_nombre ON espacios (tenant, nombre)"
    ]
  });
  app.save(espacios);

  const cotizaciones = new Collection({
    type: "base",
    name: "cotizaciones",
    listRule: publicQuotesRead,
    viewRule: publicQuotesRead,
    createRule: publicQuoteCreate,
    updateRule: tenantRead,
    deleteRule: tenantRead,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "legacy_id", type: "text", required: false, max: 64 },
      { name: "creado_por_legacy", type: "text", required: false, max: 64 },
      { name: "espacio_id", type: "number", required: false, onlyInt: true },
      { name: "espacio_nombre", type: "text", required: false, max: 255 },
      { name: "espacio_clave", type: "text", required: false, max: 80 },
      { name: "cliente_nombre", type: "text", required: false, max: 255 },
      { name: "cliente_rfc", type: "text", required: false, max: 40 },
      { name: "cliente_contacto", type: "text", required: false, max: 255 },
      { name: "cliente_email", type: "email", required: false },
      { name: "cliente_telefono", type: "text", required: false, max: 80 },
      { name: "fecha_inicio", type: "date", required: true },
      { name: "fecha_fin", type: "date", required: true },
      { name: "precio_final", type: "number", required: true, min: 0 },
      { name: "desglose_precios", type: "json", required: false },
      { name: "status", type: "select", required: true, maxSelect: 1, values: STATUS },
      { name: "numero_orden", type: "text", required: false, max: 120 },
      { name: "numero_contrato", type: "text", required: false, max: 120 },
      { name: "factura_pdf_url", type: "text", required: false, max: 500 },
      { name: "factura_xml_url", type: "text", required: false, max: 500 },
      { name: "contrato_url", type: "text", required: false, max: 500 },
      { name: "url_cotizacion_final", type: "text", required: false, max: 500 },
      { name: "url_orden_compra", type: "text", required: false, max: 500 },
      { name: "fecha_orden_compra", type: "date", required: false },
      { name: "datos_fiscales", type: "json", required: false },
      { name: "conceptos_adicionales", type: "json", required: false },
      { name: "tipo_ajuste", type: "select", required: false, maxSelect: 1, values: AJUSTES },
      { name: "valor_ajuste", type: "number", required: false },
      { name: "ajuste_es_porcentaje", type: "bool", required: false },
      { name: "desglose_impuestos", type: "json", required: false },
      { name: "historial_pagos", type: "json", required: false },
      { name: "datos_factura", type: "json", required: false },
      { name: "cliente_legacy_id", type: "text", required: false, max: 64 },
      { name: "personas", type: "number", required: false, onlyInt: true },
      { name: "detalles_evento", type: "json", required: false },
      { name: "espacios_detalle", type: "json", required: false },
      { name: "nombre_cotizacion", type: "text", required: false, max: 255 },
      { name: "permanencia_personalizada", type: "bool", required: false },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false },
      { name: "factura_pdf_file", type: "file", required: false, maxSelect: 1, maxSize: 15728640, protected: true },
      { name: "factura_xml_file", type: "file", required: false, maxSelect: 1, maxSize: 10485760, protected: true },
      { name: "contrato_file", type: "file", required: false, maxSelect: 1, maxSize: 15728640, protected: true },
      { name: "cotizacion_final_file", type: "file", required: false, maxSelect: 1, maxSize: 15728640, protected: true },
      { name: "orden_compra_file", type: "file", required: false, maxSelect: 1, maxSize: 15728640, protected: true }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_cotizaciones_tenant_legacy ON cotizaciones (tenant, legacy_id)",
      "CREATE INDEX idx_cotizaciones_tenant_status ON cotizaciones (tenant, status)",
      "CREATE INDEX idx_cotizaciones_tenant_fechas ON cotizaciones (tenant, fecha_inicio, fecha_fin)"
    ]
  });
  app.save(cotizaciones);

  const documentos = new Collection({
    type: "base",
    name: "documentos",
    listRule: tenantRead,
    viewRule: tenantRead,
    createRule: tenantRead,
    updateRule: tenantRead,
    deleteRule: tenantRead,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "cotizacion_legacy_id", type: "text", required: false, max: 64 },
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: DOC_TYPES },
      { name: "nombre_original", type: "text", required: false, max: 255 },
      { name: "ruta_legacy", type: "text", required: false, max: 500 },
      { name: "archivo", type: "file", required: true, maxSelect: 1, maxSize: 15728640, protected: true },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_documentos_tenant_cotizacion ON documentos (tenant, cotizacion_legacy_id)"
    ]
  });
  app.save(documentos);
}, (app) => {
  const names = ["documentos", "cotizaciones", "espacios", "impuestos", "configuracion", "conceptos_catalogo", "clientes", "app_users"];
  for (let i = 0; i < names.length; i++) {
    try {
      const c = app.findCollectionByNameOrId(names[i]);
      app.delete(c);
    } catch (_) {}
  }
});
