/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3728891095")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && @request.body.tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && @request.body.tenant = \"casa_de_piedra\")\n)",
    "deleteRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "listRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "updateRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)",
    "viewRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\")\n)"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3728891095")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
    "deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
    "listRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )",
    "updateRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
    "viewRule": "@request.auth.id != \"\" (   @request.auth.role = \"admin\"   || @request.auth.allowed_tenants ?= tenant   || @request.auth.tenant_default = tenant   || (@request.auth.role = \"plaza_mayor\" && tenant = \"plaza_mayor\")   || (@request.auth.role = \"casa_de_piedra\" && tenant = \"casa_de_piedra\") )"
  }, collection)

  return app.save(collection)
})
