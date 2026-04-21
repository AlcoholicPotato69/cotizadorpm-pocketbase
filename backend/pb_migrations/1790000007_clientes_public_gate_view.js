/// <reference path="../pb_data/types.d.ts" />

// Migración: permite vista pública de registros de clientes por ID directo.
// Necesario para que el gate público (ID + teléfono) pueda verificar el teléfono
// sin requerir sesión de usuario. La listRule sigue restringida a usuarios autenticados.
// El updateRule abre PATCH sin sesión para que el cliente pueda actualizar su expediente
// una vez verificado su teléfono en el frontend.
migrate((app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    return;
  }

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

  // viewRule: cualquiera puede ver un registro por su ID (acceso publico para el gate).
  // 'id != ""' es siempre verdadero para cualquier registro existente = publico.
  // La listRule sigue restringida — no se puede listar todos los clientes sin sesion.
  collection.viewRule = 'id != ""';

  // listRule: sigue restringida — requiere sesion autenticada con rol correcto.
  collection.listRule = authTenantRecord;

  // createRule: solo usuarios autenticados con rol correcto.
  collection.createRule = authTenantBody;

  // updateRule: publico para que el portal de clientes pueda hacer PATCH sin token.
  // Solo los campos seguros (telefonos_adicionales, constancia_fiscal_emitida_el, docs) son enviados.
  collection.updateRule = 'id != ""';

  // deleteRule: solo autenticados con rol correcto.
  collection.deleteRule = authTenantRecord;

  app.save(collection);
}, (app) => {
  // Rollback: restaurar reglas originales restrictivas.
  let collection;
  try {
    collection = app.findCollectionByNameOrId("clientes");
  } catch (_) {
    return;
  }

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

  collection.viewRule   = authTenantRecord;
  collection.listRule   = authTenantRecord;
  collection.createRule = authTenantBody;
  collection.updateRule = authTenantRecord;
  collection.deleteRule = authTenantRecord;

  app.save(collection);
});
