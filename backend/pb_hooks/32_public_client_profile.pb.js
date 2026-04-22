onRecordCreateRequest(function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleRecordCreateRequest(e);
}, "clientes");

onRecordUpdateRequest(function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleRecordUpdateRequest(e);
}, "clientes");

onRecordEnrich(function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleRecordEnrich(e);
}, "clientes");

onRecordCreateRequest(function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleClientDictamenChanged(e);
}, "clientes_dictamenes");

onRecordUpdateRequest(function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleClientDictamenChanged(e);
}, "clientes_dictamenes");

onRecordDeleteRequest(function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleClientDictamenChanged(e);
}, "clientes_dictamenes");

routerAdd("POST", "/api/cotizador/public-client-verify", function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handlePublicClientVerify(e);
});

routerAdd("POST", "/api/cotizador/client-profile-link", function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleClientProfileLink(e);
});

routerAdd("POST", "/api/cotizador/protected-client-zip", function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handleProtectedClientZipDownload(e);
}, $apis.bodyLimit(512 * 1024 * 1024));

routerAdd("GET", "/api/cotizador/public-client-profile", function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handlePublicClientProfileGet(e);
});

routerAdd("GET", "/api/cotizador/public-client-file", function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handlePublicClientFile(e);
});

routerAdd("POST", "/api/cotizador/public-client-profile/complete", function (e) {
  return require(`${__hooks}/client_profile_shared.js`).handlePublicClientProfileComplete(e);
}, $apis.bodyLimit(80 * 1024 * 1024));
