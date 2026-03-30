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
  
  if (!getField("material")) {
    collection.fields.add(new TextField({
      name: "material",
      max: 255
    }));
  }
  if (!getField("medida_ancho")) {
    collection.fields.add(new NumberField({
      name: "medida_ancho",
      noDecimal: false
    }));
  }
  if (!getField("medida_alto")) {
    collection.fields.add(new NumberField({
      name: "medida_alto",
      noDecimal: false
    }));
  }
  if (!getField("medida_unidad")) {
    collection.fields.add(new TextField({
      name: "medida_unidad",
      max: 20
    }));
  }

  app.save(collection);
}, (app) => {
  let collection = null;
  try { collection = app.findCollectionByNameOrId("espacios"); } catch(_) {}
  if (!collection) return;
  collection.fields.removeByName("material");
  collection.fields.removeByName("medida_ancho");
  collection.fields.removeByName("medida_alto");
  collection.fields.removeByName("medida_unidad");
  app.save(collection);
})
