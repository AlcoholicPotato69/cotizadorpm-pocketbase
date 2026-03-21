/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2128736038");

  return app.delete(collection);
}, (app) => {
  const collection = new Collection({
    "createRule": "",
    "deleteRule": "@request.auth.id != '' && @request.auth.role = 'admin'",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1314505826",
        "maxSelect": 1,
        "name": "tenant",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "plaza_mayor",
          "casa_de_piedra"
        ]
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_1163284648",
        "hidden": false,
        "id": "relation812683434",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "cotizacion_id",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text481496694",
        "max": 255,
        "min": 0,
        "name": "nombre_comercial",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2417008683",
        "max": 255,
        "min": 0,
        "name": "razon_social",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1328060911",
        "max": 40,
        "min": 0,
        "name": "rfc",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text4085563029",
        "max": 500,
        "min": 0,
        "name": "direccion",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3253144191",
        "max": 80,
        "min": 0,
        "name": "telefono",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "exceptDomains": null,
        "hidden": false,
        "id": "email3885137012",
        "name": "email",
        "onlyDomains": null,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "email"
      },
      {
        "hidden": false,
        "id": "file4007269083",
        "maxSelect": 1,
        "maxSize": 15728640,
        "mimeTypes": null,
        "name": "constancia_fiscal",
        "presentable": false,
        "protected": true,
        "required": false,
        "system": false,
        "thumbs": null,
        "type": "file"
      },
      {
        "hidden": false,
        "id": "file2759241399",
        "maxSelect": 1,
        "maxSize": 15728640,
        "mimeTypes": null,
        "name": "comprobante_domicilio",
        "presentable": false,
        "protected": true,
        "required": false,
        "system": false,
        "thumbs": null,
        "type": "file"
      },
      {
        "hidden": false,
        "id": "file2439362398",
        "maxSelect": 1,
        "maxSize": 15728640,
        "mimeTypes": null,
        "name": "identificacion_representante",
        "presentable": false,
        "protected": true,
        "required": false,
        "system": false,
        "thumbs": null,
        "type": "file"
      },
      {
        "hidden": false,
        "id": "select4235130672",
        "maxSelect": 1,
        "name": "estado_verificacion",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "pendiente",
          "verificado_finanzas",
          "verificado_mdc",
          "verificado_dg",
          "completado"
        ]
      }
    ],
    "id": "pbc_2128736038",
    "indexes": [
      "CREATE UNIQUE INDEX idx_onboarding_cotizacion ON onboarding_clientes (cotizacion_id)"
    ],
    "listRule": "@request.auth.id != '' && @request.auth.allowed_tenants ?= tenant || @request.auth.id != '' && @request.auth.role = 'admin'",
    "name": "onboarding_clientes",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != '' && @request.auth.allowed_tenants ?= tenant || @request.auth.id != '' && @request.auth.role = 'admin'",
    "viewRule": "@request.auth.id != '' && @request.auth.allowed_tenants ?= tenant || @request.auth.id != '' && @request.auth.role = 'admin'"
  });

  return app.save(collection);
})
