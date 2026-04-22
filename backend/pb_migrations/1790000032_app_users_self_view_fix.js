/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("app_users");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';
  const selfOrAdmin = '@request.auth.id != "" && (id = @request.auth.id || @request.auth.role = "admin")';

  collection.listRule = adminOnly;
  collection.viewRule = selfOrAdmin;
  collection.createRule = adminOnly;
  collection.updateRule = selfOrAdmin;
  collection.deleteRule = adminOnly;
  app.save(collection);
}, (_app) => {
  // No-op: conservar acceso de lectura del propio usuario evita sesiones rotas.
});
