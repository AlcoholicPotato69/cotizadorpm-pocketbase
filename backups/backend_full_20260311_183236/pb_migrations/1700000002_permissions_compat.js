migrate((app) => {
  const tenantAccess = [
    '@request.auth.id != ""',
    '(',
    '  @request.auth.role = "admin"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(' ');
  const publicSpacesRead = '(activo = true) || (' + tenantAccess + ')';
  const publicQuotesRead = '(' + tenantAccess + ') || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))';
  const publicQuoteCreate = '(' + tenantAccess + ') || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))';
  const publicCpConfigRead = '(' + tenantAccess + ') || (@request.auth.id = "" && tenant = "casa_de_piedra" && (clave = "premontaje_pct" || clave = "hora_extra_cfg"))';
  const publicCpConceptsRead = '(' + tenantAccess + ') || (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)';

  const applyRules = (name, rules) => {
    const collection = app.findCollectionByNameOrId(name);
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  };

  applyRules("clientes", {
    listRule: tenantAccess,
    viewRule: tenantAccess,
    createRule: tenantAccess,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });

  applyRules("conceptos_catalogo", {
    listRule: publicCpConceptsRead,
    viewRule: publicCpConceptsRead
  });

  applyRules("configuracion", {
    listRule: publicCpConfigRead,
    viewRule: publicCpConfigRead
  });

  applyRules("impuestos", {
    listRule: tenantAccess,
    viewRule: tenantAccess
  });

  applyRules("espacios", {
    listRule: publicSpacesRead,
    viewRule: publicSpacesRead,
    createRule: tenantAccess,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });

  applyRules("cotizaciones", {
    listRule: publicQuotesRead,
    viewRule: publicQuotesRead,
    createRule: publicQuoteCreate,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });

  applyRules("documentos", {
    listRule: tenantAccess,
    viewRule: tenantAccess,
    createRule: tenantAccess,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });
}, (app) => {
  const tenantAccess = '@request.auth.id != "" && @request.auth.allowed_tenants ?= tenant';
  const publicSpacesRead = '(activo = true) || (' + tenantAccess + ')';
  const publicQuotesRead = '(' + tenantAccess + ') || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))';
  const publicQuoteCreate = '(' + tenantAccess + ') || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))';
  const publicCpConfigRead = '(' + tenantAccess + ') || (@request.auth.id = "" && tenant = "casa_de_piedra" && clave = "premontaje_pct")';
  const publicCpConceptsRead = '(' + tenantAccess + ') || (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)';

  const applyRules = (name, rules) => {
    const collection = app.findCollectionByNameOrId(name);
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  };

  applyRules("clientes", {
    listRule: tenantAccess,
    viewRule: tenantAccess,
    createRule: tenantAccess,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });

  applyRules("conceptos_catalogo", {
    listRule: publicCpConceptsRead,
    viewRule: publicCpConceptsRead
  });

  applyRules("configuracion", {
    listRule: publicCpConfigRead,
    viewRule: publicCpConfigRead
  });

  applyRules("impuestos", {
    listRule: tenantAccess,
    viewRule: tenantAccess
  });

  applyRules("espacios", {
    listRule: publicSpacesRead,
    viewRule: publicSpacesRead,
    createRule: tenantAccess,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });

  applyRules("cotizaciones", {
    listRule: publicQuotesRead,
    viewRule: publicQuotesRead,
    createRule: publicQuoteCreate,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });

  applyRules("documentos", {
    listRule: tenantAccess,
    viewRule: tenantAccess,
    createRule: tenantAccess,
    updateRule: tenantAccess,
    deleteRule: tenantAccess
  });
});
