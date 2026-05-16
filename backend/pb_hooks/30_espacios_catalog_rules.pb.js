(function () {
  function trim(value) {
    return String(value || "").trim();
  }

  function enforceCatalogPermission(event) {
    const rbac = require(`${__hooks}/rbac_shared.js`);
    rbac.authorizeOrThrow(event, "catalog_manage", {
      tenant: event && event.record ? event.record.get("tenant") : "",
      targetType: "espacios",
      targetId: trim(event && event.record ? event.record.get("id") : ""),
      message: "No tienes permisos para modificar el catalogo."
    });
  }

  function normalizeAdjustmentType(value) {
    const raw = trim(value).toLowerCase();
    if (raw === "descuento" || raw === "discount") return "descuento";
    if (raw === "aumento" || raw === "porcentaje" || raw === "percent") return "aumento";
    if (raw === "monto_fijo" || raw === "fixed") return "monto_fijo";
    return raw || "ninguno";
  }

  function numberValue(value) {
    const parsed = parseFloat(String(value === null || value === undefined ? "" : value).replace(/,/g, "").trim());
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  }

  function validateCatalogDiscount(record) {
    const type = normalizeAdjustmentType(record.getString("ajuste_tipo"));
    const value = Math.max(0, numberValue(record.get("ajuste_porcentaje")));
    if (type === "descuento" && value > 10) {
      throw new BadRequestError("El descuento maximo permitido en catalogo es 10%.");
    }
    if (type === "ninguno") record.set("ajuste_porcentaje", 0);
  }

  onRecordCreateRequest(function (e) {
    enforceCatalogPermission(e);
    validateCatalogDiscount(e.record);
    e.next();
  }, "espacios");

  onRecordUpdateRequest(function (e) {
    enforceCatalogPermission(e);
    validateCatalogDiscount(e.record);
    e.next();
  }, "espacios");

  onRecordDeleteRequest(function (e) {
    enforceCatalogPermission(e);
    e.next();
  }, "espacios");
})();
