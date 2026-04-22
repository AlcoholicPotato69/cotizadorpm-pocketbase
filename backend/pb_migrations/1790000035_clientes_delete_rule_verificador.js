/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  collection.deleteRule = "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"verificador\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)";
  app.save(collection);
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  collection.deleteRule = "@request.auth.id != \"\" && @request.auth.role = \"admin\"";
  app.save(collection);
});
