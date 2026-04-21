/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("clientes_dictamenes");
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

  let hashField = getFieldByName("documentos_hash");
  if (!hashField) {
    hashField = new TextField({
      name: "documentos_hash",
      required: false,
      max: 128
    });
    collection.fields.add(hashField);
  }
  if (hashField && String(hashField.type || "").toLowerCase() === "text") {
    hashField.required = false;
    hashField.max = 128;
  }

  const pdfField = getFieldByName("pdf");
  if (pdfField && String(pdfField.type || "").toLowerCase() === "file") {
    pdfField.maxSize = Math.max(Number(pdfField.maxSize || 0), 15728640);
  }

  const indexes = Array.isArray(collection.indexes) ? [...collection.indexes] : [];
  const hashIndex = "CREATE INDEX idx_clientes_dictamenes_hash ON clientes_dictamenes (tenant, cliente, documentos_hash)";
  if (!indexes.includes(hashIndex)) indexes.push(hashIndex);
  collection.indexes = indexes;

  app.save(collection);
}, (_app) => {
  // No-op intencional: conservar metadatos históricos evita perder trazabilidad.
});
