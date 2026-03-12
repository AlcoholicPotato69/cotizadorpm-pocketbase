/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_279994318")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
}, (app) => {
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
})
