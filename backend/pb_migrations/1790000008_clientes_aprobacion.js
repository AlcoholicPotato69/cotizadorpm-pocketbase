/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    return;
  }

  // Verificar si el campo ya existe
  try {
    const existing = collection.fields.getByName("verificado_manualmente");
    if (existing) return;
  } catch (_) {}

  // Agregar el campo booleano
  const field = new BoolField({
    name: "verificado_manualmente",
    required: false
  });
  
  collection.fields.add(field);
  app.save(collection);
}, (app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    return;
  }

  try {
    collection.fields.removeByName("verificado_manualmente");
    app.save(collection);
  } catch (_) {}
});
