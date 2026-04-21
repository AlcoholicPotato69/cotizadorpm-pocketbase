/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const findCollection = (name) => {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  };

  const tenantScopedRead = [
    '(activo = true)',
    '|| (',
    '  @request.auth.id != ""',
    '  && (',
    '    @request.auth.role = "admin"',
    '    || @request.auth.role = "verificador"',
    '    || @request.auth.allowed_tenants ?= tenant',
    '    || @request.auth.tenant_default = tenant',
    '    || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '    || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    '  )',
    ')'
  ].join(' ');

  const adminVerifierWrite = [
    '@request.auth.id != ""',
    '&& (@request.auth.role = "admin" || @request.auth.role = "verificador")'
  ].join(' ');

  const espacios = findCollection("espacios");
  if (espacios) {
    espacios.listRule = tenantScopedRead;
    espacios.viewRule = tenantScopedRead;
    espacios.createRule = adminVerifierWrite;
    espacios.updateRule = adminVerifierWrite;
    espacios.deleteRule = adminVerifierWrite;
    app.save(espacios);
  }
}, (_app) => {
  // No-op: las reglas anteriores variaban por instalacion y no se restauran automaticamente.
});
