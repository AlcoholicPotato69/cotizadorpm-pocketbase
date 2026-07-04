/// <reference path="../pb_data/types.d.ts" />

// ponytail: 1780000003 metió flujo_estado en metadata JSON sin ALTER TABLE; en installs
// frescos el INSERT falla con "no column named flujo_estado". Sincroniza columna + schema.
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
  try {
    app.db().newQuery("ALTER TABLE cotizaciones ADD COLUMN flujo_estado TEXT DEFAULT ''").execute();
  } catch (_) {}

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
  } else if (String(field.type || "").toLowerCase() === "select") {
    field.required = false;
    field.maxSelect = 1;
    const currentValues = Array.isArray(field.values) ? field.values.map((value) => String(value)) : [];
    field.values = [...new Set([...currentValues, ...QUOTE_FLOW_VALUES])];
  }

  app.save(collection);
}, (_app) => {
  // No-op: conservar columna evita perder trazabilidad del flujo.
});
