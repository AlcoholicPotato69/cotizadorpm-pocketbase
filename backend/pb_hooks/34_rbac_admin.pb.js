(function () {
  routerAdd("GET", "/api/hub/rbac/catalog", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleCatalog(e);
  });

  routerAdd("GET", "/api/hub/rbac/effective", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleEffective(e);
  });

  routerAdd("GET", "/api/hub/rbac/users", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleUsersList(e);
  });

  routerAdd("POST", "/api/hub/rbac/roles/upsert", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleRoleUpsert(e);
  });

  routerAdd("POST", "/api/hub/rbac/roles/delete", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleRoleDelete(e);
  });

  routerAdd("POST", "/api/hub/rbac/users/access", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleUserAccess(e);
  });

  routerAdd("POST", "/api/hub/rbac/users/delete", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleUserDelete(e);
  });

  routerAdd("POST", "/api/hub/rbac/mode", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleMode(e);
  });
})();
