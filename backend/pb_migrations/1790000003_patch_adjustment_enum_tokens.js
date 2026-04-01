/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const fromToken = '["ninguno","porcentaje","monto_fijo","descuento"]';
  const toToken = '["ninguno","aumento","descuento","porcentaje","monto_fijo"]';

  ["espacios", "cotizaciones"].forEach((collectionName) => {
    app.db()
      .newQuery("UPDATE _collections SET fields = REPLACE(fields, {:fromToken}, {:toToken}) WHERE LOWER(name) = LOWER({:collectionName})")
      .bind({ fromToken, toToken, collectionName })
      .execute();
  });

  try {
    app.db().newQuery("UPDATE espacios SET ajuste_tipo = 'aumento' WHERE LOWER(COALESCE(ajuste_tipo, '')) = 'porcentaje'").execute();
  } catch (_) {}

  try {
    app.db().newQuery("UPDATE cotizaciones SET tipo_ajuste = 'aumento' WHERE LOWER(COALESCE(tipo_ajuste, '')) = 'porcentaje'").execute();
  } catch (_) {}

  app.reloadCachedCollections();
}, (_app) => {
  // No-op rollback: mantener compatibilidad con registros nuevos que ya usen "aumento".
});
