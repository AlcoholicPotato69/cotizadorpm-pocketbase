/// <reference path="../pb_data/types.d.ts" />

const CONFIG_COLLECTION_ID = "pbc_2165897088";
const TAX_COLLECTION_ID = "pbc_3728891095";

const CONFIG_FIELDS_DOWN = `[{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},{"hidden":false,"id":"select1314505826","maxSelect":1,"name":"tenant","presentable":false,"required":true,"system":false,"type":"select","values":["plaza_mayor","casa_de_piedra"]},{"hidden":false,"id":"number407476476","max":null,"min":null,"name":"legacy_id","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},{"autogeneratePattern":"","hidden":false,"id":"text1692948619","max":120,"min":0,"name":"clave","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},{"hidden":false,"id":"number4282077165","max":null,"min":null,"name":"valor_num","onlyInt":false,"presentable":false,"required":false,"system":false,"type":"number"},{"hidden":false,"id":"json529895231","maxSize":0,"name":"valor_json","presentable":false,"required":false,"system":false,"type":"json"},{"hidden":false,"id":"date2341372968","max":"","min":"","name":"created_at","presentable":false,"required":false,"system":false,"type":"date"},{"hidden":false,"id":"date1130519967","max":"","min":"","name":"updated_at","presentable":false,"required":false,"system":false,"type":"date"}]`;
const CONFIG_FIELDS_UP = `[{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},{"hidden":false,"id":"select1314505826","maxSelect":1,"name":"tenant","presentable":false,"required":true,"system":false,"type":"select","values":["plaza_mayor","casa_de_piedra"]},{"autogeneratePattern":"","hidden":false,"id":"text1692948619","max":120,"min":0,"name":"clave","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},{"hidden":false,"id":"number4282077165","max":null,"min":null,"name":"valor_num","onlyInt":false,"presentable":false,"required":false,"system":false,"type":"number"},{"hidden":false,"id":"json529895231","maxSize":0,"name":"valor_json","presentable":false,"required":false,"system":false,"type":"json"},{"hidden":false,"id":"date2341372968","max":"","min":"","name":"created_at","presentable":false,"required":false,"system":false,"type":"date"},{"hidden":false,"id":"date1130519967","max":"","min":"","name":"updated_at","presentable":false,"required":false,"system":false,"type":"date"}]`;
const CONFIG_INDEXES_DOWN = `["CREATE UNIQUE INDEX idx_configuracion_tenant_clave ON configuracion (tenant, clave)","CREATE UNIQUE INDEX idx_configuracion_tenant_legacy ON configuracion (tenant, legacy_id)"]`;
const CONFIG_INDEXES_UP = `["CREATE UNIQUE INDEX idx_configuracion_tenant_clave ON configuracion (tenant, clave)"]`;

const TAX_FIELDS_DOWN = `[{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},{"hidden":false,"id":"select1314505826","maxSelect":1,"name":"tenant","presentable":false,"required":true,"system":false,"type":"select","values":["plaza_mayor","casa_de_piedra"]},{"hidden":false,"id":"number407476476","max":null,"min":null,"name":"legacy_id","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},{"autogeneratePattern":"","hidden":false,"id":"text982552870","max":120,"min":0,"name":"nombre","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},{"hidden":false,"id":"number3012277485","max":null,"min":0,"name":"porcentaje","onlyInt":false,"presentable":false,"required":true,"system":false,"type":"number"},{"hidden":false,"id":"bool2882213148","name":"activo","presentable":false,"required":false,"system":false,"type":"bool"},{"hidden":false,"id":"json4023770494","maxSize":0,"name":"impuestos_aplicados","presentable":false,"required":false,"system":false,"type":"json"},{"hidden":false,"id":"date2341372968","max":"","min":"","name":"created_at","presentable":false,"required":false,"system":false,"type":"date"}]`;
const TAX_FIELDS_UP = `[{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},{"hidden":false,"id":"select1314505826","maxSelect":1,"name":"tenant","presentable":false,"required":true,"system":false,"type":"select","values":["plaza_mayor","casa_de_piedra"]},{"autogeneratePattern":"","hidden":false,"id":"text982552870","max":120,"min":0,"name":"nombre","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},{"hidden":false,"id":"number3012277485","max":null,"min":0,"name":"porcentaje","onlyInt":false,"presentable":false,"required":true,"system":false,"type":"number"},{"hidden":false,"id":"bool2882213148","name":"activo","presentable":false,"required":false,"system":false,"type":"bool"},{"hidden":false,"id":"json4023770494","maxSize":0,"name":"impuestos_aplicados","presentable":false,"required":false,"system":false,"type":"json"},{"hidden":false,"id":"date2341372968","max":"","min":"","name":"created_at","presentable":false,"required":false,"system":false,"type":"date"}]`;
const TAX_INDEXES_DOWN = `["CREATE UNIQUE INDEX idx_impuestos_tenant_legacy ON impuestos (tenant, legacy_id)"]`;
const TAX_INDEXES_UP = `[]`;

function updateCollectionMeta(app, id, fieldsJson, indexesJson) {
  app.db()
    .newQuery("UPDATE _collections SET fields = {:fields}, indexes = {:indexes} WHERE id = {:id}")
    .bind({
      id: id,
      fields: fieldsJson,
      indexes: indexesJson,
    })
    .execute();
}

migrate((app) => {
  updateCollectionMeta(app, CONFIG_COLLECTION_ID, CONFIG_FIELDS_UP, CONFIG_INDEXES_UP);
  updateCollectionMeta(app, TAX_COLLECTION_ID, TAX_FIELDS_UP, TAX_INDEXES_UP);
  try { app.db().newQuery("DROP INDEX IF EXISTS idx_configuracion_tenant_legacy").execute(); } catch (_) {}
  try { app.db().newQuery("DROP INDEX IF EXISTS idx_impuestos_tenant_legacy").execute(); } catch (_) {}
  try { app.db().newQuery("ALTER TABLE configuracion DROP COLUMN legacy_id").execute(); } catch (_) {}
  try { app.db().newQuery("ALTER TABLE impuestos DROP COLUMN legacy_id").execute(); } catch (_) {}
  app.reloadCachedCollections();
}, (app) => {
  updateCollectionMeta(app, CONFIG_COLLECTION_ID, CONFIG_FIELDS_DOWN, CONFIG_INDEXES_DOWN);
  updateCollectionMeta(app, TAX_COLLECTION_ID, TAX_FIELDS_DOWN, TAX_INDEXES_DOWN);
  try { app.db().newQuery("ALTER TABLE configuracion ADD COLUMN legacy_id NUMERIC").execute(); } catch (_) {}
  try { app.db().newQuery("ALTER TABLE impuestos ADD COLUMN legacy_id NUMERIC").execute(); } catch (_) {}
  try { app.db().newQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_configuracion_tenant_legacy ON configuracion (tenant, legacy_id)").execute(); } catch (_) {}
  try { app.db().newQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_impuestos_tenant_legacy ON impuestos (tenant, legacy_id)").execute(); } catch (_) {}
  app.reloadCachedCollections();
})
