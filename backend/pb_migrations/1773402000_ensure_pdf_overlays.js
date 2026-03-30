/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const tenantRead = [
    '@request.auth.id != ""',
    '(',
    '  @request.auth.role = "admin"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(" ");
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';

  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("pdf_overlays");
  } catch (_) {
    collection = null;
  }

  if (!collection) {
    collection = new Collection({
      type: "base",
      name: "pdf_overlays",
      listRule: tenantRead,
      viewRule: tenantRead,
      createRule: adminOnly,
      updateRule: adminOnly,
      deleteRule: adminOnly,
      fields: [
        { name: "tenant", type: "select", required: false, maxSelect: 1, values: TENANTS },
        { name: "document_type", type: "text", required: true, max: 120 },
        { name: "elements", type: "json", required: false },
        { name: "config_json", type: "json", required: false }
      ],
      indexes: [
        "CREATE INDEX idx_pdf_overlays_tenant_document ON pdf_overlays (tenant, document_type)"
      ]
    });
    app.save(collection);
    return;
  }

  const getFieldByName = (name) => {
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  const addIfMissing = (name, factory) => {
    const existing = getFieldByName(name);
    if (existing) return existing;
    const field = factory();
    collection.fields.add(field);
    return field;
  };

  const tenantField = addIfMissing("tenant", () => new SelectField({
    name: "tenant",
    required: false,
    maxSelect: 1,
    values: TENANTS
  }));
  if (tenantField && String(tenantField.type || "").toLowerCase() === "select") {
    tenantField.required = false;
    tenantField.maxSelect = 1;
    const currentValues = Array.isArray(tenantField.values) ? tenantField.values.map((v) => String(v)) : [];
    const mergedValues = [...new Set([...currentValues, ...TENANTS])];
    tenantField.values = mergedValues;
  }

  const documentTypeField = addIfMissing("document_type", () => new TextField({
    name: "document_type",
    required: true,
    max: 120
  }));
  if (documentTypeField && String(documentTypeField.type || "").toLowerCase() === "text") {
    documentTypeField.required = true;
    documentTypeField.max = 120;
  }

  const elementsField = addIfMissing("elements", () => new JSONField({
    name: "elements",
    required: false
  }));
  if (elementsField && String(elementsField.type || "").toLowerCase() === "json") {
    elementsField.required = false;
  }

  const configJsonField = addIfMissing("config_json", () => new JSONField({
    name: "config_json",
    required: false
  }));
  if (configJsonField && String(configJsonField.type || "").toLowerCase() === "json") {
    configJsonField.required = false;
  }

  const indexes = Array.isArray(collection.indexes) ? [...collection.indexes] : [];
  const overlayIndex = "CREATE INDEX idx_pdf_overlays_tenant_document ON pdf_overlays (tenant, document_type)";
  if (!indexes.includes(overlayIndex)) indexes.push(overlayIndex);
  collection.indexes = indexes;

  app.save(collection);
}, (_app) => {
  // Best effort no-op: this migration extends an existing shared collection.
});
