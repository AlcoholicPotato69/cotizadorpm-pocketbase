/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';

  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  const legacyPdfSettings = findCollection("pdf_generator_settings");
  if (legacyPdfSettings) {
    legacyPdfSettings.listRule = adminOnly;
    legacyPdfSettings.viewRule = adminOnly;
    legacyPdfSettings.createRule = adminOnly;
    legacyPdfSettings.updateRule = adminOnly;
    legacyPdfSettings.deleteRule = adminOnly;
    app.save(legacyPdfSettings);
  }

  const pdfOverlays = findCollection("pdf_overlays");
  if (pdfOverlays) {
    pdfOverlays.listRule = adminOnly;
    pdfOverlays.viewRule = adminOnly;
    pdfOverlays.createRule = adminOnly;
    pdfOverlays.updateRule = adminOnly;
    pdfOverlays.deleteRule = adminOnly;
    app.save(pdfOverlays);
  }

  const clientes = findCollection("clientes");
  if (clientes) {
    clientes.deleteRule = adminOnly;
    app.save(clientes);
  }

  const legacyUsers = findCollection("users");
  if (legacyUsers) {
    legacyUsers.listRule = null;
    legacyUsers.viewRule = null;
    legacyUsers.createRule = null;
    legacyUsers.updateRule = null;
    legacyUsers.deleteRule = null;
    legacyUsers.manageRule = null;
    legacyUsers.authRule = null;
    app.save(legacyUsers);
  }
}, (_app) => {
  // No-op intencional: esta migracion solo endurece reglas y evita reabrir superficies legacy.
});
