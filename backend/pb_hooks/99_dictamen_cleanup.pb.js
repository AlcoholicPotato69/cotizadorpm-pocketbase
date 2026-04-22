/// <reference path="../pb_data/types.d.ts" />

cronAdd("dictamen_cleanup", "0 0 * * *", () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    try {
        let deleted = 0;
        while (true) {
            const records = $app.findRecordsByFilter("clientes_dictamenes", `created < "${cutoff}"`, "created", 100, 0) || [];
            if (!records.length) break;
            let deletedThisBatch = 0;
            for (let i = 0; i < records.length; i++) {
                try {
                    const pdfValue = records[i] ? records[i].get("pdf") : null;
                    const hasPdf = Array.isArray(pdfValue)
                        ? pdfValue.filter(Boolean).length > 0
                        : String(pdfValue || "").trim() !== "";
                    if (hasPdf) continue;
                    $app.delete(records[i]);
                    deleted += 1;
                    deletedThisBatch += 1;
                } catch (e) {
                    console.error("[dictamen_cleanup] Error deleting record", records[i] && records[i].id, e);
                }
            }
            if (deletedThisBatch === 0) break;
        }
        if (deleted > 0) console.log("[dictamen_cleanup] Deleted", deleted, "orphan dictamen placeholders without pdf.");
    } catch (err) {
        console.error("[dictamen_cleanup] Cron error:", String(err));
    }
});
