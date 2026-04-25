/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("hub_notifications");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  const getField = (name) => {
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  const addFieldIfMissing = (name, factory) => {
    let field = getField(name);
    if (field) return field;
    field = factory();
    collection.fields.add(field);
    return field;
  };

  addFieldIfMissing("notification_key", () => new TextField({
    name: "notification_key",
    required: false,
    max: 120
  }));

  addFieldIfMissing("dismissed", () => new BoolField({
    name: "dismissed",
    required: false
  }));

  addFieldIfMissing("dismissed_at", () => new DateField({
    name: "dismissed_at",
    required: false
  }));

  const indexes = Array.isArray(collection.indexes) ? collection.indexes.slice() : [];
  [
    "CREATE INDEX idx_hub_notifications_user_active_created ON hub_notifications (user_id, dismissed, created_at)",
    "CREATE INDEX idx_hub_notifications_group_state ON hub_notifications (notification_key, dismissed, dismissed_at)"
  ].forEach((idx) => {
    if (indexes.indexOf(idx) === -1) indexes.push(idx);
  });
  collection.indexes = indexes;
  app.save(collection);

  try {
    app.db().newQuery("UPDATE hub_notifications SET notification_key = COALESCE(NULLIF(notification_key, ''), id)").execute();
  } catch (_) {}
  try {
    app.db().newQuery("UPDATE hub_notifications SET dismissed = COALESCE(dismissed, 0)").execute();
  } catch (_) {}
}, (app) => {
  let collection = null;
  try {
    collection = app.findCollectionByNameOrId("hub_notifications");
  } catch (_) {
    collection = null;
  }
  if (!collection) return;

  try { collection.fields.removeByName("notification_key"); } catch (_) {}
  try { collection.fields.removeByName("dismissed"); } catch (_) {}
  try { collection.fields.removeByName("dismissed_at"); } catch (_) {}
  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : []).filter((idx) => (
    idx !== "CREATE INDEX idx_hub_notifications_user_active_created ON hub_notifications (user_id, dismissed, created_at)"
    && idx !== "CREATE INDEX idx_hub_notifications_group_state ON hub_notifications (notification_key, dismissed, dismissed_at)"
  ));
  app.save(collection);
});
