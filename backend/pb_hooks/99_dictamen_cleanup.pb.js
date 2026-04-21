/// <reference path="../pb_data/types.d.ts" />

cronAdd("dictamen_cleanup", "0 0 * * *", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const cutoff = twoYearsAgo.toISOString();

    try {
        let deleted = 0;
        while (true) {
            const records = $app.findRecordsByFilter("clientes_dictamenes", `created < "${cutoff}"`, "created", 100, 0) || [];
            if (!records.length) break;
            for (let i = 0; i < records.length; i++) {
                try {
                    $app.delete(records[i]);
                    deleted += 1;
                } catch (e) {
                    console.error("[dictamen_cleanup] Error deleting record", records[i] && records[i].id, e);
                }
            }
        }
        if (deleted > 0) console.log("[dictamen_cleanup] Deleted", deleted, "expired dictamenes.");
    } catch (err) {
        console.error("[dictamen_cleanup] Cron error:", String(err));
    }
});
