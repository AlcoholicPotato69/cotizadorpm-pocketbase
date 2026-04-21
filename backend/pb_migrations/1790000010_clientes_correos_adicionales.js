/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  let field = null;
  try {
    field = collection.fields.getByName("correos_adicionales");
  } catch (_) {
    field = null;
  }

  if (!field) {
    collection.fields.add(new JSONField({
      name: "correos_adicionales",
      required: false
    }));
    app.save(collection);
    return;
  }

  if (String(field.type || "").toLowerCase() === "json") {
    field.required = false;
    app.save(collection);
  }
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  try {
    collection.fields.removeByName("correos_adicionales");
    app.save(collection);
  } catch (_) {}
});
