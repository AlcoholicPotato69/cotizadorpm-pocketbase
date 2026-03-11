/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2607630173")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2607630173")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
    "deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
    "listRule": "(@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )) || (@request.auth.id = \"\" && tenant = \"casa_de_piedra\" && activo = true)",
    "updateRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
    "viewRule": "(@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )) || (@request.auth.id = \"\" && tenant = \"casa_de_piedra\" && activo = true)"
  }, collection)

  return app.save(collection)
})
