/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_279994318")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @request.auth.allowed_tenants ?= tenant",
    "deleteRule": "@request.auth.id != \"\" && @request.auth.allowed_tenants ?= tenant",
    "listRule": null,
    "updateRule": "@request.auth.id != \"\" && @request.auth.allowed_tenants ?= tenant",
    "viewRule": "@request.auth.id != \"\" && @request.auth.allowed_tenants ?= tenant"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_279994318")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )",
    "deleteRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )",
    "listRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )",
    "updateRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )",
    "viewRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )"
  }, collection)

  return app.save(collection)
})
