/// <reference path="../pb_data/types.d.ts" />

function safeFindCollection(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function getField(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function renameField(collection, fromName, toName) {
  const fromField = getField(collection, fromName);
  if (!fromField) return;
  if (getField(collection, toName)) {
    collection.fields.removeByName(fromName);
    return;
  }
  fromField.name = toName;
}

function removeField(collection, name) {
  collection.fields.removeByName(name);
}

function ensureTextField(collection, name, max, hidden) {
  if (getField(collection, name)) return;
  const field = new TextField({
    name: name,
    required: false,
    max: max || 255,
    hidden: !!hidden,
  });
  collection.fields.add(field);
}

function ensureNumberField(collection, name, onlyInt) {
  if (getField(collection, name)) return;
  const field = new NumberField({
    name: name,
    required: false,
    onlyInt: !!onlyInt,
  });
  collection.fields.add(field);
}

function setIndexes(collection, indexes) {
  collection.indexes = Array.isArray(indexes) ? indexes : [];
}

function dropIndexIfExists(app, indexName) {
  try {
    app.db().newQuery("DROP INDEX IF EXISTS " + indexName).execute();
  } catch (_) {}
}

function createIndexIfNotExists(app, sql) {
  try {
    app.db().newQuery(sql).execute();
  } catch (_) {}
}

migrate((app) => {
  const appUsers = safeFindCollection(app, "app_users");
  if (appUsers) {
    removeField(appUsers, "legacy_profile_id");
    setIndexes(appUsers, [
      "CREATE UNIQUE INDEX idx_app_users_login_username_nocase ON app_users (LOWER(login_username))",
      "CREATE UNIQUE INDEX idx_tokenKey_pbc_3362450114 ON app_users (tokenKey)",
      "CREATE UNIQUE INDEX idx_email_pbc_3362450114 ON app_users (email) WHERE email != ''",
    ]);
    app.save(appUsers);
  }

  const clientes = safeFindCollection(app, "clientes");
  if (clientes) {
    removeField(clientes, "legacy_id");
    setIndexes(clientes, []);
    app.save(clientes);
  }

  const conceptos = safeFindCollection(app, "conceptos_catalogo");
  if (conceptos) {
    removeField(conceptos, "legacy_id");
    setIndexes(conceptos, []);
    app.save(conceptos);
  }

  const cotizaciones = safeFindCollection(app, "cotizaciones");
  if (cotizaciones) {
    renameField(cotizaciones, "cliente_legacy_id", "cliente_id");
    renameField(cotizaciones, "creado_por_legacy", "creado_por");
    renameField(cotizaciones, "modificado_por_legacy", "modificado_por");
    removeField(cotizaciones, "legacy_id");
    setIndexes(cotizaciones, [
      "CREATE INDEX idx_cotizaciones_tenant_status ON cotizaciones (tenant, status)",
      "CREATE INDEX idx_cotizaciones_tenant_fechas ON cotizaciones (tenant, fecha_inicio, fecha_fin)",
      "CREATE INDEX idx_cotizaciones_tenant_espacio_id ON cotizaciones (tenant, espacio_id)",
    ]);
    app.save(cotizaciones);
  }

  const documentos = safeFindCollection(app, "documentos");
  if (documentos) {
    renameField(documentos, "cotizacion_legacy_id", "cotizacion_id");
    renameField(documentos, "ruta_legacy", "ruta");
    setIndexes(documentos, [
      "CREATE INDEX idx_documentos_tenant_cotizacion ON documentos (tenant, cotizacion_id)",
    ]);
    app.save(documentos);
  }

  dropIndexIfExists(app, "idx_app_users_legacy_profile_id");
  dropIndexIfExists(app, "idx_clientes_tenant_legacy");
  dropIndexIfExists(app, "idx_conceptos_tenant_legacy");
  dropIndexIfExists(app, "idx_cotizaciones_tenant_legacy");
  dropIndexIfExists(app, "idx_documentos_tenant_cotizacion");

  createIndexIfNotExists(app, "CREATE INDEX IF NOT EXISTS idx_documentos_tenant_cotizacion ON documentos (tenant, cotizacion_id)");
  createIndexIfNotExists(app, "CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_status ON cotizaciones (tenant, status)");
  createIndexIfNotExists(app, "CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_fechas ON cotizaciones (tenant, fecha_inicio, fecha_fin)");
  createIndexIfNotExists(app, "CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_espacio_id ON cotizaciones (tenant, espacio_id)");

  app.reloadCachedCollections();
}, (app) => {
  const appUsers = safeFindCollection(app, "app_users");
  if (appUsers) {
    ensureTextField(appUsers, "legacy_profile_id", 64, true);
    setIndexes(appUsers, [
      "CREATE UNIQUE INDEX idx_app_users_legacy_profile_id ON app_users (legacy_profile_id)",
      "CREATE UNIQUE INDEX idx_app_users_login_username_nocase ON app_users (LOWER(login_username))",
      "CREATE UNIQUE INDEX idx_tokenKey_pbc_3362450114 ON app_users (tokenKey)",
      "CREATE UNIQUE INDEX idx_email_pbc_3362450114 ON app_users (email) WHERE email != ''",
    ]);
    app.save(appUsers);
  }

  const clientes = safeFindCollection(app, "clientes");
  if (clientes) {
    ensureTextField(clientes, "legacy_id", 64, false);
    setIndexes(clientes, [
      "CREATE UNIQUE INDEX idx_clientes_tenant_legacy ON clientes (tenant, legacy_id)",
    ]);
    app.save(clientes);
  }

  const conceptos = safeFindCollection(app, "conceptos_catalogo");
  if (conceptos) {
    ensureNumberField(conceptos, "legacy_id", true);
    setIndexes(conceptos, [
      "CREATE UNIQUE INDEX idx_conceptos_tenant_legacy ON conceptos_catalogo (tenant, legacy_id)",
    ]);
    app.save(conceptos);
  }

  const cotizaciones = safeFindCollection(app, "cotizaciones");
  if (cotizaciones) {
    renameField(cotizaciones, "cliente_id", "cliente_legacy_id");
    renameField(cotizaciones, "creado_por", "creado_por_legacy");
    renameField(cotizaciones, "modificado_por", "modificado_por_legacy");
    ensureTextField(cotizaciones, "legacy_id", 64, false);
    setIndexes(cotizaciones, [
      "CREATE UNIQUE INDEX idx_cotizaciones_tenant_legacy ON cotizaciones (tenant, legacy_id)",
      "CREATE INDEX idx_cotizaciones_tenant_status ON cotizaciones (tenant, status)",
      "CREATE INDEX idx_cotizaciones_tenant_fechas ON cotizaciones (tenant, fecha_inicio, fecha_fin)",
      "CREATE INDEX idx_cotizaciones_tenant_espacio_id ON cotizaciones (tenant, espacio_id)",
    ]);
    app.save(cotizaciones);
  }

  const documentos = safeFindCollection(app, "documentos");
  if (documentos) {
    renameField(documentos, "cotizacion_id", "cotizacion_legacy_id");
    renameField(documentos, "ruta", "ruta_legacy");
    setIndexes(documentos, [
      "CREATE INDEX idx_documentos_tenant_cotizacion ON documentos (tenant, cotizacion_legacy_id)",
    ]);
    app.save(documentos);
  }

  dropIndexIfExists(app, "idx_documentos_tenant_cotizacion");
  createIndexIfNotExists(app, "CREATE INDEX IF NOT EXISTS idx_documentos_tenant_cotizacion ON documentos (tenant, cotizacion_legacy_id)");

  app.reloadCachedCollections();
});
