/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const TARGET_VALUES = ["ninguno", "aumento", "descuento", "porcentaje", "monto_fijo"];

  const updateSelectField = (collectionName, fieldName) => {
    let collection = null;
    try {
      collection = app.findCollectionByNameOrId(collectionName);
    } catch (_) {
      collection = null;
    }
    if (!collection) return null;

    let field = null;
    try {
      field = collection.fields.getByName(fieldName);
    } catch (_) {
      field = null;
    }
    if (!field || String(field.type || "").toLowerCase() !== "select") return collection;

    const currentValues = Array.isArray(field.values) ? field.values.map((value) => String(value)) : [];
    const mergedValues = [...new Set([...currentValues, ...TARGET_VALUES])];
    field.maxSelect = 1;
    field.values = mergedValues;
    app.save(collection);
    return collection;
  };

  const normalizeLegacyPercentageValue = (collectionName, fieldName) => {
    let collection = null;
    try {
      collection = app.findCollectionByNameOrId(collectionName);
    } catch (_) {
      collection = null;
    }
    if (!collection) return;

    const records = app.findAllRecords(collection) || [];
    records.forEach((record) => {
      const raw = String(record.get(fieldName) || "").trim().toLowerCase();
      if (raw !== "porcentaje") return;
      record.set(fieldName, "aumento");
      app.save(record);
    });
  };

  updateSelectField("espacios", "ajuste_tipo");
  updateSelectField("cotizaciones", "tipo_ajuste");
  normalizeLegacyPercentageValue("espacios", "ajuste_tipo");
  normalizeLegacyPercentageValue("cotizaciones", "tipo_ajuste");
}, (_app) => {
  // No-op rollback: conservar compatibilidad con clientes viejos y nuevos.
});
