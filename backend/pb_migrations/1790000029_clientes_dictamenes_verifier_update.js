/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes_dictamenes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;
  const adminVerifierOnly = "@request.auth.id != \"\" && (@request.auth.role = \"admin\" || @request.auth.role = \"verificador\")";
  collection.listRule = adminVerifierOnly;
  collection.viewRule = adminVerifierOnly;
  collection.createRule = adminVerifierOnly;
  collection.updateRule = adminVerifierOnly;
  collection.deleteRule = adminVerifierOnly;
  app.save(collection);
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes_dictamenes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;
  collection.listRule = "@request.auth.id != \"\"";
  collection.viewRule = "@request.auth.id != \"\"";
  collection.createRule = "@request.auth.id != \"\" && (@request.auth.role = \"admin\" || @request.auth.role = \"verificador\")";
  collection.updateRule = "@request.auth.role = \"admin\"";
  collection.deleteRule = "@request.auth.role = \"admin\"";
  app.save(collection);
});
