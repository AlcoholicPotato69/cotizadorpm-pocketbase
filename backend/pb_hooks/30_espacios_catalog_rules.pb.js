(function () {
  function trim(value) {
    return String(value || "").trim();
  }

  function roleOf(record) {
    return trim(record && record.getString ? record.getString("role") : "").toLowerCase();
  }

  function canManageCatalog(e) {
    if (e && e.hasSuperuserAuth && e.hasSuperuserAuth()) return true;
    var role = roleOf(e ? e.auth : null);
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

  function enforceSpaceRules(e) {
    if (!canManageCatalog(e)) {
      throw new ForbiddenError("Solo administradores y verificadores pueden modificar el catálogo.");
    }
    var type = normalizeAdjustmentType(e.record.getString("ajuste_tipo"));
    var value = Math.max(0, numberValue(e.record.get("ajuste_porcentaje")));
    if (type === "descuento" && value > 10) {
      throw new BadRequestError("El descuento maximo permitido en catalogo es 10%.");
    }
    if (type === "ninguno") e.record.set("ajuste_porcentaje", 0);
    e.next();
  }

  onRecordCreateRequest(enforceSpaceRules, "espacios");
  onRecordUpdateRequest(enforceSpaceRules, "espacios");

  onRecordDeleteRequest(function (e) {
    if (!canManageCatalog(e)) {
      throw new ForbiddenError("Solo administradores y verificadores pueden modificar el catálogo.");
    }
    e.next();
  }, "espacios");
})();
