/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("app_users");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  let field = null;
  try {
    field = collection.fields.getByName("role");
  } catch (_) {
    field = null;
  }
  if (!field) return;

  const values = Array.isArray(field.values) ? field.values.slice() : [];
  if (values.indexOf("verificador") === -1) values.push("verificador");
  field.values = values;
  app.save(collection);
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("app_users");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  let field = null;
  try {
    field = collection.fields.getByName("role");
  } catch (_) {
    field = null;
  }
  if (!field) return;

  field.values = (Array.isArray(field.values) ? field.values : []).filter((value) => value !== "verificador");
  app.save(collection);
});
