/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_279994318");

  unmarshal({
    "listRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"verificador\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "viewRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"verificador\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "updateRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"verificador\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "deleteRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)"
  }, collection);

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_279994318");

  unmarshal({
    "listRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "viewRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "updateRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "deleteRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  @request.auth.role = \"ambos\" ||\n  @request.auth.allowed_tenants ?= tenant ||\n  @request.auth.tenant_default = tenant ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)"
  }, collection);

  return app.save(collection);
});
