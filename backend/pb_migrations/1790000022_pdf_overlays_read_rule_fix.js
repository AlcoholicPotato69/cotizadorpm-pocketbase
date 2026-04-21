/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';
  const tenantRead = [
    '@request.auth.id != "" &&',
    '(',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.role = "ambos"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(' ');

  let pdfOverlays = null;
  try {
    pdfOverlays = app.findCollectionByNameOrId("pdf_overlays");
  } catch (_) {
    pdfOverlays = null;
  }
  if (!pdfOverlays) return;

  pdfOverlays.listRule = tenantRead;
  pdfOverlays.viewRule = tenantRead;
  pdfOverlays.createRule = adminOnly;
  pdfOverlays.updateRule = adminOnly;
  pdfOverlays.deleteRule = adminOnly;
  app.save(pdfOverlays);
}, (_app) => {
  // No-op: mantener la correccion de lectura autenticada por tenant.
});
