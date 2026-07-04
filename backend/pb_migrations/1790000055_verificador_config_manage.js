/// <reference path="../pb_data/types.d.ts" />

// Migración: agregar config_manage al rol verificador.
// Motivo: isVerifierUser era un bypass por nombre de rol (inseguro).
// Ahora el acceso a config viene EXCLUSIVAMENTE de config_manage permission.
// El rol verificador debe tenerlo explícitamente para mantener el comportamiento anterior.
migrate((app) => {
  let record = null;
  try {
    record = app.findFirstRecordByData("app_roles", "slug", "verificador");
  } catch (_) {
    return; // No existe el rol, nada que hacer
  }
  if (!record) return;

  let permsGlobal = {};
  try {
    const raw = record.get("permissions_global");
    if (raw && typeof raw === "object") {
      permsGlobal = raw;
    } else if (typeof raw === "string") {
      permsGlobal = JSON.parse(raw) || {};
    }
  } catch (_) {
    permsGlobal = {};
  }

  const allow = Array.isArray(permsGlobal.allow) ? [...permsGlobal.allow] : [];
  const deny = Array.isArray(permsGlobal.deny) ? [...permsGlobal.deny] : [];

  // Agregar config_manage al allow si no esta ya
  if (allow.indexOf("config_manage") === -1) {
    allow.push("config_manage");
  }
  // Quitar de deny si estuviera
  const denyFiltered = deny.filter((k) => k !== "config_manage");

  record.set("permissions_global", { allow, deny: denyFiltered });
  app.save(record);
}, (app) => {
  // Rollback: quitar config_manage del verificador
  let record = null;
  try {
    record = app.findFirstRecordByData("app_roles", "slug", "verificador");
  } catch (_) { return; }
  if (!record) return;

  let permsGlobal = {};
  try {
    const raw = record.get("permissions_global");
    if (raw && typeof raw === "object") permsGlobal = raw;
    else if (typeof raw === "string") permsGlobal = JSON.parse(raw) || {};
  } catch (_) { permsGlobal = {}; }

  const allow = (Array.isArray(permsGlobal.allow) ? permsGlobal.allow : [])
    .filter((k) => k !== "config_manage");
  const deny = Array.isArray(permsGlobal.deny) ? permsGlobal.deny : [];

  record.set("permissions_global", { allow, deny });
  app.save(record);
});
