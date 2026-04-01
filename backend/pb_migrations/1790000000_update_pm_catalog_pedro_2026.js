/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const spaces = [
        { clave: "Z1-1", nombre: "Puente entre Banamex y Sanborn's", descripcion: "Ubicado entre Banamex y Sanborns, de cara al portico 1.", precio_base: 40000, material: "Lona", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z1-2", nombre: "Muro a un lado de Coloso y Zara", descripcion: "Ubicado en Zona 1 en el acceso a Zona 3, a un costado de Coloso y Zara.", precio_base: 26250, material: "Lona sobre bastidor", medida_ancho: 2.20, medida_alto: 2.82 },
        { clave: "Z1-3", nombre: "Ave en Domo Suburbia", descripcion: "Ubicado debajo del domo principal en zona 1.", precio_base: 49000, material: "Lona sobre bastidor", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z1-9", nombre: "Muro Espectacular entre Zara y Massimo Dutti", descripcion: "Ubicado en Zona 3, frente a Sears, de cara al domo principal.", precio_base: 50000, material: "Vinil sobre bastidor", medida_ancho: 13.0, medida_alto: 3.0 },
        { clave: "Z2-1", nombre: "Antepecho Pasillo a C&A", descripcion: "Ubicado en el pasillo de salida de Zona 2 y entrada a zona 1 por la pista de hielo.", precio_base: 55700, material: "Vinil", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z3-5", nombre: "Escaleras del Domo Principal (2 caras)", descripcion: "Ubicado en Zona 3, frente a Sears, Zara, Liverpool y la isla de Starbucks.", precio_base: 45000, material: "Vinil Autoadherible", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z3-6", nombre: "Paquete de 10 pendones interiores", descripcion: "Ubicados en los principales pasillos de Zona 3, visibles desde primer y segundo piso.", precio_base: 49000, material: "Lona", medida_ancho: 0.7, medida_alto: 5.0 },
        { clave: "Z3-8", nombre: "Puente en Pasillo principal", descripcion: "Ubicado en el pasillo principal de Zona 3, visible desde primer y segundo piso.", precio_base: 40000, material: "Lona sobre bastidor", medida_ancho: 7.28, medida_alto: 1.19 },
        { clave: "Z3-12", nombre: "Espectacular sobre balcon Sears", descripcion: "Ubicado en Zona 1, entre Zara y Massimo Dutti, con vista al portico 1.", precio_base: 45000, material: "Lona sobre bastidor", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z3-21", nombre: "Ave en Domo Principal", descripcion: "Ubicado debajo del domo principal en Zona 3.", precio_base: 49000, material: "Lona sobre bastidor", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z4-1", nombre: "Cristales Interiores Escaleras Eléctricas", descripcion: "Ubicado en Zona 4, frente al acceso del portico 4, y acceso a segunda planta hacia Cinemex.", precio_base: 40000, material: "Vinil Autoadherible", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z4-2", nombre: "Cristales Exteriores Escaleras Eléctricas", descripcion: "Ubicado en Zona 4, frente al acceso del portico 4, y acceso a segunda planta hacia Cinemex.", precio_base: 40000, material: "Vinil Autoadherible", medida_ancho: 2.77, medida_alto: 3.65 },
        { clave: "Z4-2 VAR", nombre: "Cristal Exterior Escaleras Eléctricas (1 cristal)", descripcion: "Ubicado en Zona 4 frente a H&M en el acceso a Zona Moda.", precio_base: 35000, material: "Vinil Autoadherible", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z4-3", nombre: "Cristal Superior Zona de Cajeros", descripcion: "Ubicado en Zona 6, frente a H&M, de cara a la explanada de la fuente y diversas islas.", precio_base: 30000, material: "Vinil Autoadherible", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z5-2", nombre: "Elevador Panoramico", descripcion: "Ubicado en Zona 5, frente al acceso del portico 4, y acceso a segunda planta hacia Cinemex.", precio_base: 45000, material: "Vinil Autoadherible", medida_ancho: 2.14, medida_alto: 9.77 },
        { clave: "Z6-1", nombre: "Cristales laterales escaleras Banana Republic", descripcion: "Stradivarius, etc.", precio_base: 40000, material: "Vinil Autoadherible", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z6-4", nombre: "Dorso de Elevador Zona 6", descripcion: "Ubicado en Zona 6, a la salida del subterraneo, de cara al pasillo principal.", precio_base: 50000, material: "Vinil Autoadherible", medida_ancho: 0, medida_alto: 0 },
        { clave: "Z7-12", nombre: "Puente Central de Pasillo", descripcion: "Ubicado en Zona 6, frente a H&M y Vans, de cara a Zona de Cajeros.", precio_base: 39500, material: "Vinil", medida_ancho: 0, medida_alto: 0 }
    ];

    for (const s of spaces) {
        try {
            const records = app.findRecordsByFilter("espacios", `clave = '${s.clave}'`);
            if (records && records.length > 0) {
                // Update existing
                for (const rec of records) {
                    rec.set("nombre", s.nombre);
                    rec.set("descripcion", s.descripcion);
                    rec.set("precio_base", s.precio_base);
                    rec.set("material", s.material);
                    if (s.medida_ancho > 0) rec.set("medida_ancho", s.medida_ancho);
                    if (s.medida_alto > 0) rec.set("medida_alto", s.medida_alto);
                    app.save(rec);
                }
            } else {
                // Create new
                const newRec = new Record("espacios", {
                    tenant: "plaza_mayor",
                    clave: s.clave,
                    nombre: s.nombre,
                    tipo: "publicitario",
                    descripcion: s.descripcion,
                    precio_base: s.precio_base,
                    material: s.material,
                    medida_ancho: s.medida_ancho,
                    medida_alto: s.medida_alto,
                    activo: true,
                    etiquetas: ["pen - x"]
                });
                app.save(newRec);
            }
        } catch (err) {
            console.error("Error processing " + s.clave + ":", err);
        }
    }
}, (app) => {
    // downgrade is empty
})