/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("cotizaciones");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  const getFieldByName = (name) => {
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  const ensureTextField = (name, max = 255) => {
    let field = getFieldByName(name);
    if (!field) {
      field = new TextField({
        name,
        required: false,
        max
      });
      collection.fields.add(field);
    }
    if (field && String(field.type || "").toLowerCase() === "text") {
      field.required = false;
      field.max = max;
    }
  };

  ensureTextField("creado_por_nombre", 255);
  ensureTextField("modificado_por", 255);
  ensureTextField("modificado_por_nombre", 255);

  app.save(collection);
}, (_app) => {
  // No-op: conservar campos de auditoría para mantener trazabilidad histórica.
});
