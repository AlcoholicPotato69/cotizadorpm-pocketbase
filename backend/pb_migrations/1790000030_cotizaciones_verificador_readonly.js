/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const readTenantRecord = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const writeTenantRecord = [
    '@request.auth.id != ""',
    '&& @request.auth.role != "verificador"',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const writeTenantBody = [
    '@request.auth.id != ""',
    '&& @request.auth.role != "verificador"',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || @request.auth.allowed_tenants ?= @request.body.tenant',
    '  || @request.auth.tenant_default = @request.body.tenant',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const publicQuoteCreate = [
    `(${writeTenantBody})`,
    '|| (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))'
  ].join(" ");

  const collection = app.findCollectionByNameOrId("cotizaciones");
  collection.listRule = readTenantRecord;
  collection.viewRule = readTenantRecord;
  collection.createRule = publicQuoteCreate;
  collection.updateRule = writeTenantRecord;
  collection.deleteRule = writeTenantRecord;
  app.save(collection);
}, (app) => {
  const authTenantRecord = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const publicQuoteCreate = [
    `(@request.auth.id != "" && (`,
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    "))",
    '|| (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))'
  ].join(" ");

  const collection = app.findCollectionByNameOrId("cotizaciones");
  collection.listRule = authTenantRecord;
  collection.viewRule = authTenantRecord;
  collection.createRule = publicQuoteCreate;
  collection.updateRule = authTenantRecord;
  collection.deleteRule = authTenantRecord;
  app.save(collection);
});
