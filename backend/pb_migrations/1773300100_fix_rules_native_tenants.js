migrate((app) => {
  const authTenantRecord = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const authTenantBody = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const publicSpacesRead = `(activo = true) || (${authTenantRecord})`;
  const publicQuotesRead = `(${authTenantRecord}) || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))`;
  const publicQuoteCreate = `(${authTenantBody}) || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))`;
  const publicCpConfigRead = `(${authTenantRecord}) || (@request.auth.id = "" && tenant = "casa_de_piedra" && (clave = "premontaje_pct" || clave = "hora_extra_cfg"))`;
  const publicCpConceptsRead = `(${authTenantRecord}) || (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)`;

  const applyRules = (name, rules) => {
    const collection = app.findCollectionByNameOrId(name);
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  };

  applyRules("clientes", {
    listRule: authTenantRecord,
    viewRule: authTenantRecord,
    createRule: authTenantBody,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });

  applyRules("conceptos_catalogo", {
    listRule: publicCpConceptsRead,
    viewRule: publicCpConceptsRead,
    createRule: authTenantBody,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });

  applyRules("configuracion", {
    listRule: publicCpConfigRead,
    viewRule: publicCpConfigRead,
    createRule: authTenantBody,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });

  applyRules("impuestos", {
    listRule: authTenantRecord,
    viewRule: authTenantRecord,
    createRule: authTenantBody,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });

  applyRules("espacios", {
    listRule: publicSpacesRead,
    viewRule: publicSpacesRead,
    createRule: authTenantBody,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });

  applyRules("cotizaciones", {
    listRule: publicQuotesRead,
    viewRule: publicQuotesRead,
    createRule: publicQuoteCreate,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });

  applyRules("documentos", {
    listRule: authTenantRecord,
    viewRule: authTenantRecord,
    createRule: authTenantBody,
    updateRule: authTenantRecord,
    deleteRule: authTenantRecord
  });
}, (app) => {
  const oldRecordRule = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const oldBodyRule = [
    '@request.auth.id != ""',
    "&& (",
    '  @request.auth.role = "admin"',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    ")"
  ].join(" ");

  const applyRules = (name, rules) => {
    const collection = app.findCollectionByNameOrId(name);
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  };

  applyRules("clientes", {
    listRule: oldRecordRule,
    viewRule: oldRecordRule,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldRecordRule
  });

  applyRules("conceptos_catalogo", {
    listRule: oldRecordRule,
    viewRule: oldRecordRule,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldBodyRule
  });

  applyRules("configuracion", {
    listRule: oldRecordRule,
    viewRule: oldRecordRule,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldRecordRule
  });

  applyRules("impuestos", {
    listRule: oldRecordRule,
    viewRule: oldRecordRule,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldRecordRule
  });

  applyRules("espacios", {
    listRule: `(activo = true) || (${oldRecordRule})`,
    viewRule: `(activo = true) || (${oldRecordRule})`,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldRecordRule
  });

  applyRules("cotizaciones", {
    listRule: oldRecordRule,
    viewRule: oldRecordRule,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldRecordRule
  });

  applyRules("documentos", {
    listRule: oldRecordRule,
    viewRule: oldRecordRule,
    createRule: oldBodyRule,
    updateRule: oldRecordRule,
    deleteRule: oldRecordRule
  });
});
