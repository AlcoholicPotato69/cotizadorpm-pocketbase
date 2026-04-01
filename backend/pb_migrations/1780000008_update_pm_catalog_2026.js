/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const updates = [
        { clave: "Z1-1", precio_base: 40000, material: "Lona", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z1-2", precio_base: 27000, material: "Lona sobre bastidor", medida_ancho: 2.20, medida_alto: 2.82 },
        { clave: "Z1-3", precio_base: 49000, material: "Lona sobre bastidor", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z1-9", precio_base: 50000, material: "Lona sobre bastidor", medida_ancho: 13.0, medida_alto: 3.0 },
        
        // El pdf decía: Z2-1 (Antepecho pasillo C&A) = 58,500. Sin embargo, en DB había otro Z2-1 de $55,700
        { clave: "Z2-1", precio_base: 58500, material: "Vinil", medida_ancho: 0, medida_alto: 0 },
        
        { clave: "Z3-5", precio_base: 40000, material: "Vinil con reverso gris/negro", medida_ancho: 9.6, medida_alto: 0.57 },
        { clave: "Z3-6", precio_base: 50000, material: "Lona", medida_ancho: 0.7, medida_alto: 5.0 }, // paquete pendones
        { clave: "Z3-8", precio_base: 42000, material: "Lona sobre bastidor", medida_ancho: 7.28, medida_alto: 1.19 },
        { clave: "Z3-12", precio_base: 45000, material: "Lona sobre bastidor", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z3-21", precio_base: 51000, material: "Lona sobre bastidor", medida_ancho: 0, medida_alto: 0 },
        
        { clave: "Z4-1", precio_base: 40000, material: "Vinil autoadherible", medida_ancho: 2.66, medida_alto: 3.3 }, // cristales int esc elec
        { clave: "Z4-2", precio_base: 45000, material: "Vinil autoadherible", medida_ancho: 2.77, medida_alto: 3.65 }, // zara home o cinemex ext
        { clave: "Z4-3", precio_base: 30000, material: "Vinil", medida_ancho: 4.8, medida_alto: 1.0 }, // cristal ext
        
        { clave: "Z5-2", precio_base: 47000, material: "Vinil autoadherible", medida_ancho: 2.14, medida_alto: 9.77 },
        
        { clave: "Z6-1", precio_base: 40000, material: "Vinil autoadherible", medida_ancho: 0, medida_alto: 0 },
        
        { clave: "Z7-12", precio_base: 40000, material: "Vinil", medida_ancho: 12.0, medida_alto: 1.0 }, 
        { clave: "Z7-12 VAR 2", precio_base: 40000, material: "Vinil", medida_ancho: 24.0, medida_alto: 1.0 }, 
        
        { clave: "EST 253 E-F", precio_base: 25000, material: "Lona sobre bastidor", medida_ancho: 1.20, medida_alto: 3.10 }
    ];

    for (const u of updates) {
        try {
            const records = app.findRecordsByFilter("espacios", `clave = '${u.clave}'`);
            if (records && records.length > 0) {
                for (const rec of records) {
                    rec.set("precio_base", u.precio_base);
                    rec.set("material", u.material);
                    if (u.medida_ancho > 0) rec.set("medida_ancho", u.medida_ancho);
                    if (u.medida_alto > 0) rec.set("medida_alto", u.medida_alto);
                    app.save(rec);
                }
            }
        } catch (err) {
            console.error("Error updating " + u.clave + ":", err);
        }
    }
}, (app) => {
    // downgrade is empty
})
