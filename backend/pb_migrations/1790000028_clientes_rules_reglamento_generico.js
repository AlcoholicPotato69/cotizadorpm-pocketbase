/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const TEMPLATE_FILE = "REGLAMENTO_GENERICO.html";
  const TEMPLATE_PATH = "templates_reglamentos/" + TEMPLATE_FILE;
  const TEMPLATE_NAME = "Reglamento generico";
  const TEMPLATE_HTML = [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '  <meta charset="utf-8">',
    "  <style>",
    "    body{font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:12px;line-height:1.6;margin:0;}",
    "    h1{font-size:20px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.04em;}",
    "    h2{font-size:13px;margin:18px 0 8px;text-transform:uppercase;color:#374151;}",
    "    p{margin:0 0 10px;}",
    "    ol{margin:0 0 0 18px;padding:0;}",
    "    li{margin:0 0 8px;}",
    "    .meta{border:1px solid #e5e7eb;padding:10px 12px;margin:12px 0 18px;background:#f9fafb;}",
    "  </style>",
    "</head>",
    "<body>",
    "  <h1>Reglamento general de uso del espacio</h1>",
    '  <div class="meta">',
    "    <p><strong>Cliente:</strong> {{CLIENTE}}</p>",
    "    <p><strong>Espacio:</strong> {{ESPACIO}} ({{CLAVE}})</p>",
    "    <p><strong>Vigencia del evento:</strong> {{FECHA_INICIO}} al {{FECHA_FIN}}</p>",
    "    <p><strong>Contrato:</strong> {{NUM_CONTRATO}}</p>",
    "  </div>",
    "  <h2>Disposiciones generales</h2>",
    "  <ol>",
    "    <li>El cliente debera utilizar el espacio exclusivamente para el montaje, operacion y desmontaje autorizados en la cotizacion y contrato correspondientes.</li>",
    "    <li>Cualquier cambio de horario, ubicacion, dimensiones, materiales o dinamica de operacion debera solicitarse y aprobarse por escrito antes del evento.</li>",
    "    <li>El cliente es responsable de conservar el orden, limpieza y seguridad de su personal, proveedores, invitados y materiales durante toda la estancia.</li>",
    "    <li>No se permite bloquear accesos, salidas de emergencia, pasillos tecnicos, equipos de seguridad ni areas no incluidas en la contratacion.</li>",
    "    <li>Todo dano al inmueble, mobiliario, infraestructura, areas verdes, instalaciones electricas o elementos decorativos sera responsabilidad del cliente.</li>",
    "    <li>Los residuos, empaques, sobrantes de montaje y materiales promocionales deberan retirarse al concluir el desmontaje.</li>",
    "    <li>El uso de sonido, energia electrica, estructuras, alimentos, bebidas, fuego, humo, pirotecnia o cualquier elemento de riesgo requiere autorizacion previa.</li>",
    "    <li>La administracion podra suspender actividades que representen riesgo, incumplimiento contractual, afectacion a terceros o uso distinto al autorizado.</li>",
    "  </ol>",
    "  <h2>Aceptacion</h2>",
    "  <p>El presente reglamento funciona como anexo operativo generico y podra complementarse con reglas especificas del espacio, plaza, venue o evento contratado.</p>",
    "</body>",
    "</html>"
  ].join("\n");

  const tenantRead = [
    '@request.auth.id != "" && (',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(" ");
  const tenantCreate = [
    '@request.auth.id != "" && (',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= @request.body.tenant',
    '  || @request.auth.tenant_default = @request.body.tenant',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    ')'
  ].join(" ");
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';

  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function escapeFilter(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function findFirst(collectionName, filter) {
    try {
      const rows = app.findRecordsByFilter(collectionName, filter, "", 1, 0) || [];
      return rows[0] || null;
    } catch (_) {
      return null;
    }
  }

  function ensureDocument(tenant, recordId) {
    const collection = findCollection("documentos");
    if (!collection) return;
    const filter = "tenant = '" + escapeFilter(tenant) + "' && ruta = '" + escapeFilter(TEMPLATE_PATH) + "'";
    let record = findFirst("documentos", filter);
    if (!record) {
      record = new Record(collection);
      record.set("id", recordId);
    }
    const form = new RecordUpsertForm(app, record);
    form.grantSuperuserAccess();
    form.load({
      tenant: tenant,
      tipo: "otro",
      nombre_original: TEMPLATE_NAME + ".html",
      ruta: TEMPLATE_PATH,
      archivo: $filesystem.fileFromBytes(TEMPLATE_HTML, TEMPLATE_FILE),
      updated_at: new Date().toISOString()
    });
    form.submit();
  }

  function ensureDefaultConfig(tenant) {
    const collection = findCollection("configuracion");
    if (!collection) return;
    const filter = "tenant = '" + escapeFilter(tenant) + "' && clave = 'reglamento_template_default'";
    let record = findFirst("configuracion", filter);
    if (!record) record = new Record(collection);
    record.set("tenant", tenant);
    record.set("clave", "reglamento_template_default");
    record.set("valor_json", {
      file_name: TEMPLATE_FILE,
      path: TEMPLATE_PATH,
      seeded_by: "1790000028_clientes_rules_reglamento_generico",
      updated_at: new Date().toISOString()
    });
    record.set("updated_at", new Date().toISOString());
    app.save(record);
  }

  const clientes = findCollection("clientes");
  if (clientes) {
    clientes.listRule = tenantRead;
    clientes.viewRule = tenantRead + ' || (@request.auth.id = "" && perfil_publico_token != "")';
    clientes.createRule = tenantCreate;
    clientes.updateRule = tenantRead + ' || (@request.auth.id = "" && perfil_publico_token != "")';
    clientes.deleteRule = adminOnly;
    app.save(clientes);
  }

  ensureDocument(TENANTS[0], "reggenpm0000001");
  ensureDocument(TENANTS[1], "reggencp0000001");
  ensureDefaultConfig(TENANTS[0]);
  ensureDefaultConfig(TENANTS[1]);
}, (app) => {
  function findRecords(collectionName, filter) {
    try {
      return app.findRecordsByFilter(collectionName, filter, "", 100, 0) || [];
    } catch (_) {
      return [];
    }
  }

  function removeStorage(recordId) {
    try {
      const dataDir = String(app.dataDir ? app.dataDir() : "pb_data").replace(/\\/g, "/").replace(/\/+$/, "");
      $os.removeAll(dataDir + "/storage/pbc_3758627238/" + recordId);
    } catch (_) {}
  }

  const docs = findRecords("documentos", "ruta = 'templates_reglamentos/REGLAMENTO_GENERICO.html'");
  docs.forEach((record) => {
    const id = String(record.get("id") || "");
    try { app.delete(record); } catch (_) {}
    if (id) removeStorage(id);
  });

  const cfgs = findRecords("configuracion", "clave = 'reglamento_template_default'");
  cfgs.forEach((record) => {
    const value = record.get("valor_json") || {};
    if (value && value.path === "templates_reglamentos/REGLAMENTO_GENERICO.html") {
      try { app.delete(record); } catch (_) {}
    }
  });
});
