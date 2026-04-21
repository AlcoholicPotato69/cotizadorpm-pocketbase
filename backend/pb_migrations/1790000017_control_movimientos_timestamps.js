/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("control_movimientos");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  function hasField(name) {
    try {
      return !!collection.fields.getByName(name);
    } catch (_) {
      return false;
    }
  }

  if (!hasField("created_at")) {
    collection.fields.add(new TextField({
      name: "created_at",
      required: false
    }));
  }

  if (!hasField("updated_at")) {
    collection.fields.add(new TextField({
      name: "updated_at",
      required: false
    }));
  }

  app.save(collection);

  const nowIso = new Date().toISOString();
  try {
    app.db()
      .newQuery("UPDATE control_movimientos SET created_at = COALESCE(NULLIF(created_at, ''), {:nowIso}), updated_at = COALESCE(NULLIF(updated_at, ''), {:nowIso})")
      .bind({ nowIso })
      .execute();
  } catch (_) {}
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("control_movimientos");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  try { collection.fields.removeByName("created_at"); } catch (_) {}
  try { collection.fields.removeByName("updated_at"); } catch (_) {}
  app.save(collection);
});
