(function () {
  onRecordCreateRequest(function (e) {
    function trim(value) {
      return String(value || "").trim();
    }

    function roleOf(record) {
      return trim(record && record.getString ? record.getString("role") : "").toLowerCase();
    }

    function canManageCatalog(event) {
      if (event && event.hasSuperuserAuth && event.hasSuperuserAuth()) return true;
      var authRecord = event ? (event.auth || (event.requestInfo && event.requestInfo.auth ? event.requestInfo.auth : null)) : null;
      var role = roleOf(authRecord);
      return role === "admin" || role === "verificador";
    }

    function normalizeAdjustmentType(value) {
      var raw = trim(value).toLowerCase();
      if (raw === "descuento" || raw === "discount") return "descuento";
      if (raw === "aumento" || raw === "porcentaje" || raw === "percent") return "aumento";
      if (raw === "monto_fijo" || raw === "fixed") return "monto_fijo";
      return raw || "ninguno";
    }

    function numberValue(value) {
      var parsed = parseFloat(String(value === null || value === undefined ? "" : value).replace(/,/g, "").trim());
      return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
    }

    if (!canManageCatalog(e)) {
      throw new ForbiddenError("Solo administradores y verificadores pueden modificar el catalogo.");
    }
    var type = normalizeAdjustmentType(e.record.getString("ajuste_tipo"));
    var value = Math.max(0, numberValue(e.record.get("ajuste_porcentaje")));
    if (type === "descuento" && value > 10) {
      throw new BadRequestError("El descuento maximo permitido en catalogo es 10%.");
    }
    if (type === "ninguno") e.record.set("ajuste_porcentaje", 0);
    e.next();
  }, "espacios");

  onRecordUpdateRequest(function (e) {
    function trim(value) {
      return String(value || "").trim();
    }

    function roleOf(record) {
      return trim(record && record.getString ? record.getString("role") : "").toLowerCase();
    }

    function canManageCatalog(event) {
      if (event && event.hasSuperuserAuth && event.hasSuperuserAuth()) return true;
      var authRecord = event ? (event.auth || (event.requestInfo && event.requestInfo.auth ? event.requestInfo.auth : null)) : null;
      var role = roleOf(authRecord);
      return role === "admin" || role === "verificador";
    }

    function normalizeAdjustmentType(value) {
      var raw = trim(value).toLowerCase();
      if (raw === "descuento" || raw === "discount") return "descuento";
      if (raw === "aumento" || raw === "porcentaje" || raw === "percent") return "aumento";
      if (raw === "monto_fijo" || raw === "fixed") return "monto_fijo";
      return raw || "ninguno";
    }

    function numberValue(value) {
      var parsed = parseFloat(String(value === null || value === undefined ? "" : value).replace(/,/g, "").trim());
      return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
    }

    if (!canManageCatalog(e)) {
      throw new ForbiddenError("Solo administradores y verificadores pueden modificar el catalogo.");
    }
    var type = normalizeAdjustmentType(e.record.getString("ajuste_tipo"));
    var value = Math.max(0, numberValue(e.record.get("ajuste_porcentaje")));
    if (type === "descuento" && value > 10) {
      throw new BadRequestError("El descuento maximo permitido en catalogo es 10%.");
    }
    if (type === "ninguno") e.record.set("ajuste_porcentaje", 0);
    e.next();
  }, "espacios");

  onRecordDeleteRequest(function (e) {
    function trim(value) {
      return String(value || "").trim();
    }

    function roleOf(record) {
      return trim(record && record.getString ? record.getString("role") : "").toLowerCase();
    }

    function canManageCatalog(event) {
      if (event && event.hasSuperuserAuth && event.hasSuperuserAuth()) return true;
      var authRecord = event ? (event.auth || (event.requestInfo && event.requestInfo.auth ? event.requestInfo.auth : null)) : null;
      var role = roleOf(authRecord);
      return role === "admin" || role === "verificador";
    }

    if (!canManageCatalog(e)) {
      throw new ForbiddenError("Solo administradores y verificadores pueden modificar el catalogo.");
    }
    e.next();
  }, "espacios");
})();
