cronAdd("rbac_audit_cleanup", "15 2 * * *", () => {
  try {
    const cutoffDate = new Date(Date.now() - (730 * 24 * 60 * 60 * 1000));
    const cutoffIso = cutoffDate.toISOString();
    while (true) {
      const rows = $app.findRecordsByFilter("rbac_audit_logs", `created_at < "${cutoffIso}"`, "created_at", 200, 0) || [];
      if (!rows.length) break;
      let deleted = 0;
      for (let i = 0; i < rows.length; i += 1) {
        try {
          $app.delete(rows[i]);
          deleted += 1;
        } catch (_) { }
      }
      if (!deleted) break;
    }
  } catch (err) {
    console.error("[rbac_audit_cleanup] Error:", String(err));
  }
});
