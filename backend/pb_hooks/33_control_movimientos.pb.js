onRecordCreateRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleQuoteCreate(e);
}, "cotizaciones");

onRecordUpdateRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleQuoteUpdate(e);
}, "cotizaciones");

onRecordDeleteRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleQuoteDelete(e);
}, "cotizaciones");

onRecordCreateRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleSpaceCreate(e);
}, "espacios");

onRecordUpdateRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleSpaceUpdate(e);
}, "espacios");

onRecordDeleteRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleSpaceDelete(e);
}, "espacios");

onRecordCreateRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleClientCreate(e);
}, "clientes");

onRecordUpdateRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleClientUpdate(e);
}, "clientes");

onRecordDeleteRequest(function (e) {
  return require(`${__hooks}/control_movimientos_shared.js`).handleClientDelete(e);
}, "clientes");

routerAdd("GET", "/api/cotizador/server-time", function (e) {
  return e.json(200, {
    ok: true,
    now: new Date().toISOString()
  });
});
