/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2607630173")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && @request.body.tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && @request.body.tenant = \"casa_de_piedra\")\n)",
    "deleteRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && @request.body.tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && @request.body.tenant = \"casa_de_piedra\")\n)",
    "listRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && @request.body.tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && @request.body.tenant = \"casa_de_piedra\")\n)",
    "updateRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && @request.body.tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && @request.body.tenant = \"casa_de_piedra\")\n)",
    "viewRule": "@request.auth.id != \"\" && (\n  @request.auth.role = \"admin\" ||\n  (@request.auth.role = \"plaza_mayor\" && @request.body.tenant = \"plaza_mayor\") ||\n  (@request.auth.role = \"casa_de_piedra\" && @request.body.tenant = \"casa_de_piedra\")\n)"
  }, collection)

  return app.save(collection)
}, (app) => {
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
})
