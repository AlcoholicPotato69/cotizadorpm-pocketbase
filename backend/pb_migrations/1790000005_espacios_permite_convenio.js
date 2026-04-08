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

  if (!getField("permite_convenio")) {
    collection.fields.add(new BoolField({
      name: "permite_convenio"
    }));
  }

  app.save(collection);
}, (app) => {
  let collection = null;
  try { collection = app.findCollectionByNameOrId("espacios"); } catch (_) {}
  if (!collection) return;
  collection.fields.removeByName("permite_convenio");
  app.save(collection);
})
