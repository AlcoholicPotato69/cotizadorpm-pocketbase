/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let existing = null;
  try {
    existing = app.findCollectionByNameOrId("control_movimientos");
  } catch (_) {
    existing = null;
  }
  if (existing) return;

  const tenantScopedRead = "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"verificador\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)";
  const adminOnly = "@request.auth.id != \"\" && @request.auth.role = \"admin\"";

  const collection = new Collection({
    type: "base",
    name: "control_movimientos",
    listRule: tenantScopedRead,
    viewRule: tenantScopedRead,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: ["plaza_mayor", "casa_de_piedra"] },
      { name: "tipo_movimiento", type: "text", required: true, max: 80 },
      { name: "entidad_tipo", type: "text", required: true, max: 40 },
      { name: "entidad_id", type: "text", required: false, max: 64 },
      { name: "entidad_nombre", type: "text", required: false, max: 255 },
      { name: "cliente_id", type: "text", required: false, max: 64 },
      { name: "cliente_nombre", type: "text", required: false, max: 255 },
      { name: "cotizacion_id", type: "text", required: false, max: 64 },
      { name: "cotizacion_folio", type: "text", required: false, max: 120 },
      { name: "documento_campo", type: "text", required: false, max: 80 },
      { name: "documento_nombre", type: "text", required: false, max: 120 },
      { name: "actor_id", type: "text", required: false, max: 64 },
      { name: "actor_nombre", type: "text", required: false, max: 255 },
      { name: "actor_role", type: "text", required: false, max: 40 },
      { name: "resumen", type: "text", required: false, max: 500 },
      { name: "metadata", type: "json", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_control_movimientos_tenant_tipo ON control_movimientos (tenant, tipo_movimiento)",
      "CREATE INDEX idx_control_movimientos_tenant_actor ON control_movimientos (tenant, actor_nombre)",
      "CREATE INDEX idx_control_movimientos_cliente ON control_movimientos (tenant, cliente_id)",
      "CREATE INDEX idx_control_movimientos_cotizacion ON control_movimientos (tenant, cotizacion_id)"
    ]
  });

  app.save(collection);
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("control_movimientos");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;
  app.delete(collection);
});
