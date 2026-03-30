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

  let notesField = getFieldByName("notas_pdf");
  if (!notesField) {
    notesField = new JSONField({
      name: "notas_pdf",
      required: false
    });
    collection.fields.add(notesField);
  }

  if (notesField && String(notesField.type || "").toLowerCase() === "json") {
    notesField.required = false;
  }

  app.save(collection);
}, (_app) => {
  // No-op intencional: la reversa no elimina el campo para evitar pérdida de notas.
});
