/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    return;
  }

  // Quitar el campo anterior que ya no usaremos
  try {
    collection.fields.removeByName("verificado_manualmente");
  } catch (_) {}

  // Agregar el campo JSON para control individual
  try {
    const existing = collection.fields.getByName("documentos_estado");
    if (!existing) {
      collection.fields.add(new JSONField({
        name: "documentos_estado",
        required: false
      }));
    }
  } catch (_) {}
  
  app.save(collection);
}, (app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    return;
  }

  try {
    collection.fields.removeByName("documentos_estado");
    app.save(collection);
  } catch (_) {}
});
