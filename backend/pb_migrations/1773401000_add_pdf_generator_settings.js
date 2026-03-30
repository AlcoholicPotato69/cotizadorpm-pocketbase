/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const tenantRead = [
    '@request.auth.id != ""',
    '(',
    '  @request.auth.role = "admin"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(' ');
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';

  const collection = new Collection({
    type: "base",
    name: "pdf_generator_settings",
    listRule: tenantRead,
    viewRule: tenantRead,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "tenant", type: "select", required: true, maxSelect: 1, values: TENANTS },
      { name: "generator_type", type: "text", required: true, max: 80 },
      { name: "config_json", type: "json", required: false },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_pdf_generator_settings_tenant_generator ON pdf_generator_settings (tenant, generator_type)"
    ]
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pdf_generator_settings");
  app.delete(collection);
});
