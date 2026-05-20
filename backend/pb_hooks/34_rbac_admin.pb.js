(function () {
  routerAdd("GET", "/api/hub/rbac/catalog", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleCatalog(e);
  });

  routerAdd("GET", "/api/hub/rbac/effective", function (e) {
    return require(`${__hooks}/rbac_admin_shared.js`).handleEffective(e);
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

  onRecordUpdateRequest((e) => {
    const rbac = require(`${__hooks}/rbac_shared.js`);
    const authRecord = e.httpContext.get("authRecord");

    // Si la request proviene de un admin (superuser en pocketbase), ignoramos.
    if (e.httpContext.get("admin")) {
        return;
    }

    // Si el usuario objetivo se está editando a si mismo u otro admin le está editando, necesitamos verificar
    // que el campo app_metadata o allowed_tenants no estén siendo modificados si el actor no es un admin RBAC
    if (e.collection.name === "app_users") {
      const actorEffective = authRecord ? rbac.resolveEffective(authRecord, "") : null;
      const isActorAdmin = actorEffective ? actorEffective.is_admin : false;

      // Si el actor no es admin, no debe poder modificar su role, allowed_tenants o app_metadata
      if (!isActorAdmin) {
        const reqData = e.httpContext.requestInfo().body;
        if (reqData) {
           if (reqData.app_metadata !== undefined) {
             throw new BadRequestError("Solo un administrador puede modificar los metadatos de la aplicación.");
           }
           if (reqData.allowed_tenants !== undefined) {
             throw new BadRequestError("Solo un administrador puede modificar los tenants permitidos.");
           }
           if (reqData.role !== undefined) {
             throw new BadRequestError("Solo un administrador puede modificar el rol principal.");
           }
        }
      }
    }
  }, "app_users");

})();
