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

  const publicCpConfigRead = [
    `(${readTenantRecord})`,
    '|| (@request.auth.id = "" && tenant = "casa_de_piedra" && (clave = "premontaje_pct" || clave = "hora_extra_cfg"))'
  ].join(" ");

  const publicCpConceptsRead = [
    `(${readTenantRecord})`,
    '|| (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)'
  ].join(" ");

  const publicSpacesRead = [
    '(activo = true)',
    `|| (${readTenantRecord})`
  ].join(" ");

  const publicQuotesRead = [
    `(${readTenantRecord})`,
    '|| (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))'
  ].join(" ");

  const publicQuoteCreate = [
    `(${writeTenantBody})`,
    '|| (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))'
  ].join(" ");

  function applyRules(name, rules) {
    const collection = app.findCollectionByNameOrId(name);
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  }

  applyRules("clientes", {
    listRule: readTenantRecord,
    viewRule: readTenantRecord,
    createRule: writeTenantBody,
    updateRule: writeTenantRecord,
    deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"'
  });

  applyRules("conceptos_catalogo", {
    listRule: publicCpConceptsRead,
    viewRule: publicCpConceptsRead,
    createRule: writeTenantBody,
    updateRule: writeTenantRecord,
    deleteRule: writeTenantRecord
  });

  applyRules("configuracion", {
    listRule: publicCpConfigRead,
    viewRule: publicCpConfigRead,
    createRule: writeTenantBody,
    updateRule: writeTenantRecord,
    deleteRule: writeTenantRecord
  });

  applyRules("impuestos", {
    listRule: readTenantRecord,
    viewRule: readTenantRecord,
    createRule: writeTenantBody,
    updateRule: writeTenantRecord,
    deleteRule: writeTenantRecord
  });

  applyRules("espacios", {
    listRule: publicSpacesRead,
    viewRule: publicSpacesRead,
    createRule: writeTenantBody,
    updateRule: writeTenantRecord,
    deleteRule: writeTenantRecord
  });

  applyRules("cotizaciones", {
    listRule: publicQuotesRead,
    viewRule: publicQuotesRead,
    createRule: publicQuoteCreate,
    updateRule: writeTenantRecord,
    deleteRule: writeTenantRecord
  });

  applyRules("documentos", {
    listRule: readTenantRecord,
    viewRule: readTenantRecord,
    createRule: writeTenantBody,
    updateRule: writeTenantRecord,
    deleteRule: writeTenantRecord
  });
}, (_app) => {
  // No-op intencional para evitar reinstalar reglas anteriores más restrictivas.
});
