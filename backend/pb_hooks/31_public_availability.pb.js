// ponytail: handlers serializados solo ven require() — lógica en public_availability_shared.js
routerAdd("GET", "/api/cotizador/public-availability", function (e) {
  const pub = require(`${__hooks}/public_availability_shared.js`);
  const query = e.request.url.query();
  const tenant = pub.normalizeTenant(query.get("tenant"));
  const spaceId = pub.normalizeSpaceId(query.get("spaceId"));

  if (!tenant || !spaceId) {
    throw new BadRequestError("tenant y spaceId son obligatorios.");
  }

  const filter = `tenant = "${tenant}" && (status = "aprobada" || status = "finalizada")`;
  const records = $app.findRecordsByFilter("cotizaciones", filter, "-updated", 5000, 0) || [];
  const result = pub.buildAvailability(tenant, spaceId, records);

  e.response.header().set("Content-Type", "application/json; charset=utf-8");
  e.response.header().set("Cache-Control", "public, max-age=60");
  e.response.header().set("X-Content-Type-Options", "nosniff");
  e.response.header().set("X-Frame-Options", "DENY");

  return e.string(200, JSON.stringify({
    ok: true,
    tenant: result.tenant,
    spaceId: result.spaceId,
    dates: result.dates,
    generatedAt: new Date().toISOString()
  }));
});
