/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  const getField = (name) => {
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  let originField = getField("perfil_origen");
  if (!originField) {
    originField = new TextField({
      name: "perfil_origen",
      required: false,
      max: 40
    });
    collection.fields.add(originField);
  }
  originField.required = false;
  originField.max = 40;

  app.save(collection);
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  try {
    collection.fields.removeByName("perfil_origen");
    app.save(collection);
  } catch (_) {}
});
