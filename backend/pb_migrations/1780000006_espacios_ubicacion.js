migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("espacios");
  } catch (_) {
    return;
  }
  if (!collection) return;

  const getField = (name) => {
    try { return collection.fields.getByName(name); } catch (_) { return null; }
  };

  if (!getField("ubicacion")) {
    collection.fields.add(new TextField({
      name: "ubicacion",
      max: 255
    }));
  }

  app.save(collection);
}, (app) => {
  let collection = null;
  try { collection = app.findCollectionByNameOrId("espacios"); } catch (_) {}
  if (!collection) return;
  collection.fields.removeByName("ubicacion");
  app.save(collection);
})
