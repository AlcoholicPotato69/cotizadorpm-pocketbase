/// <reference path="../pb_data/types.d.ts" />

const QUOTE_FLOW_VALUES = [
  "cotizacion_aprobada",
  "onboarding_cliente",
  "revision_datos",
  "contrato_generado",
  "contrato_revision_juridico",
  "contrato_enviado_cliente",
  "contrato_firmado",
  "factura_solicitada",
  "factura_emitida",
  "completado"
];

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("cotizaciones");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  let field = null;
  try {
    field = collection.fields.getByName("flujo_estado");
  } catch (_) {
    field = null;
  }

  if (!field) {
    field = new SelectField({
      name: "flujo_estado",
      required: false,
      maxSelect: 1,
      values: QUOTE_FLOW_VALUES
    });
    collection.fields.add(field);
  }

  if (field && String(field.type || "").toLowerCase() === "select") {
    field.required = false;
    field.maxSelect = 1;
    const currentValues = Array.isArray(field.values) ? field.values.map((value) => String(value)) : [];
    field.values = [...new Set([...currentValues, ...QUOTE_FLOW_VALUES])];
  }

  app.save(collection);
}, (_app) => {
  // No-op: conservar el estado del flujo mantiene trazabilidad historica.
});
