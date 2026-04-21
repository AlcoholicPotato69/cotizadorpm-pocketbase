/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let existing = null;
  try {
    existing = app.findCollectionByNameOrId("clientes_dictamenes");
  } catch (_) {
    existing = null;
  }
  if (existing) return;

  let clientesCollection = null;
  try {
    clientesCollection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    clientesCollection = null;
  }
  if (!clientesCollection) return;

  const tenantScopedRead = "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"verificador\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)";
  const creatorOnly = "@request.auth.id != \"\" && (@request.auth.role = \"admin\" || @request.auth.role = \"verificador\" || @request.auth.role = \"ambos\")";

  const collection = new Collection({
    type: "base",
    name: "clientes_dictamenes",
    listRule: tenantScopedRead,
    viewRule: tenantScopedRead,
    createRule: creatorOnly,
    updateRule: "@request.auth.role = \"admin\"",
    deleteRule: "@request.auth.role = \"admin\"",
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: ["plaza_mayor", "casa_de_piedra"] },
      { 
        name: "cliente", 
        type: "relation", 
        required: true, 
        maxSelect: 1, 
        collectionId: clientesCollection.id,
        cascadeDelete: true 
      },
      { name: "folio", type: "text", required: true, max: 120 },
      { name: "documentos_hash", type: "text", required: false, max: 128 },
      { name: "responsable_nombre", type: "text", required: false, max: 255 },
      { 
        name: "pdf", 
        type: "file", 
        required: true, 
        maxSelect: 1, 
        maxSize: 15728640,
        mimeTypes: ["application/pdf"] 
      },
      { name: "metadata", type: "json", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_clientes_dictamenes_tenant_cliente ON clientes_dictamenes (tenant, cliente)",
      "CREATE INDEX idx_clientes_dictamenes_folio ON clientes_dictamenes (folio)",
      "CREATE INDEX idx_clientes_dictamenes_hash ON clientes_dictamenes (tenant, cliente, documentos_hash)"
    ]
  });

  app.save(collection);
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes_dictamenes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;
  app.delete(collection);
});
