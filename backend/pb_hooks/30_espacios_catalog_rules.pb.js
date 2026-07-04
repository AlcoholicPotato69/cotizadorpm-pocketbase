// ponytail: handlers serializados solo ven require() — lógica en espacios_guard_shared.js
onRecordCreateRequest(function (e) {
  const g = require(`${__hooks}/espacios_guard_shared.js`);
  g.enforceCatalog(e);
  g.validateDiscount(e.record);
  e.next();
}, "espacios");

onRecordUpdateRequest(function (e) {
  const g = require(`${__hooks}/espacios_guard_shared.js`);
  g.enforceCatalog(e);
  g.validateDiscount(e.record);
  e.next();
}, "espacios");

onRecordDeleteRequest(function (e) {
  require(`${__hooks}/espacios_guard_shared.js`).enforceCatalog(e);
  e.next();
}, "espacios");
