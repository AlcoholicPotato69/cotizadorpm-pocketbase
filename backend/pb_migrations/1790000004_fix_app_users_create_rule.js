/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("app_users");
  collection.createRule = '@request.auth.id != "" && @request.auth.role = "admin"';
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("app_users");
  collection.createRule = null;
  return app.save(collection);
});
