/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("espacios");
  const imagenField = collection.fields.getByName("imagen");
  if (imagenField) {
      imagenField.maxSelect = 5;
  }
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("espacios");
  const imagenField = collection.fields.getByName("imagen");
  if (imagenField) {
      imagenField.maxSelect = 1;
  }
  return app.save(collection);
})
