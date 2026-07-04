/// <reference path="../pb_data/types.d.ts" />

// Restaura lectura de cotizaciones para verificador (0030) dentro del modelo is_admin.
migrate((app) => {
  const authed = '@request.auth.id != ""';
  const isAdmin = "@request.auth.is_admin = true";
  const readQuotes = [
    `(${authed} && (${isAdmin} || @request.auth.role = "verificador" || @request.auth.allowed_tenants ?= tenant))`,
    '|| (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))'
  ].join(" ");
  const writeQuotes = [
    authed,
    '&& @request.auth.role != "verificador"',
    `&& (${isAdmin} || @request.auth.allowed_tenants ?= tenant)`
  ].join(" ");
  const writeBody = [
    authed,
    '&& @request.auth.role != "verificador"',
    `&& (${isAdmin} || @request.auth.allowed_tenants ?= @request.body.tenant)`
  ].join(" ");
  const publicQuoteCreate = [
    `(${writeBody})`,
    '|| (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))'
  ].join(" ");

  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("cotizaciones");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  collection.listRule = readQuotes;
  collection.viewRule = readQuotes;
  collection.createRule = publicQuoteCreate;
  collection.updateRule = writeQuotes;
  collection.deleteRule = writeQuotes;
  app.save(collection);
}, (_app) => {
  // No-op: mantener reglas unificadas vigentes.
});
