migrate((app) => {
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
}, (app) => {
  const authTenantRecord = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const publicQuotesRead = `(${authTenantRecord}) || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))`;
  const publicQuoteCreate = `((@request.auth.id != "" && (@request.auth.role = "admin" || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor") || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")))) || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))`;

  const collection = app.findCollectionByNameOrId("cotizaciones");
  collection.listRule = publicQuotesRead;
  collection.viewRule = publicQuotesRead;
  collection.createRule = publicQuoteCreate;
  collection.updateRule = authTenantRecord;
  collection.deleteRule = authTenantRecord;
  app.save(collection);
});
