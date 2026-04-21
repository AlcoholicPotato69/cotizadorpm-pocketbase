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
    field = collection.fields.getByName("comprobante_domicilio_emitido_el");
  } catch (_) {
    field = null;
  }

  if (!field) {
    collection.fields.add(new DateField({
      name: "comprobante_domicilio_emitido_el",
      required: false
    }));
    app.save(collection);
    return;
  }

  if (String(field.type || "").toLowerCase() === "date") {
    field.required = false;
    field.min = "";
    field.max = "";
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
    collection.fields.removeByName("comprobante_domicilio_emitido_el");
    app.save(collection);
  } catch (_) {}
});
