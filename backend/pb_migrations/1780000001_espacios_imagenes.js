migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("espacios");
  } catch (_) {
    return;
  }
  if (!collection) return;

  const getField = (name) => {
    try { return collection.fields.getByName(name); } catch(_) { return null; }
  };
  
  const addFileF = (name) => {
    if (!getField(name)) {
      const f = new FileField({
        name: name,
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/svg+xml", "image/gif", "image/webp"]
      });
      collection.fields.add(f);
    }
  };

  addFileF("imagen2");
  addFileF("imagen3");
  addFileF("imagen4");
  addFileF("imagen5");

  const img1 = getField("imagen");
  if (img1) {
    img1.maxSelect = 1;
  }

  app.save(collection);
}, (app) => {
  let collection = null;
  try { collection = app.findCollectionByNameOrId("espacios"); } catch(_) {}
  if (!collection) return;
  collection.fields.removeByName("imagen2");
  collection.fields.removeByName("imagen3");
  collection.fields.removeByName("imagen4");
  collection.fields.removeByName("imagen5");
  app.save(collection);
})
