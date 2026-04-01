/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("espacios");
  if (!collection) return;

  const normalize = (value) => String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const allRecords = app.findAllRecords(collection) || [];
  const plazaMayorRecords = allRecords.filter((record) => record.get("tenant") === "plaza_mayor");
  const used = {};

  const targets = [
    {
      clave: "Z1-1",
      nombre: "Puente entre Banamex y Sanborn's",
      descripcion: "Ubicado entre Banamex y Sanborns, de cara al pórtico 1.",
      ubicacion: "Zona 1",
      precio_base: 40000,
      material: "Lona",
    },
    {
      clave: "Z1-2",
      nombre: "Muro a un lado de Coloso y Zara",
      descripcion: "Ubicado en Zona 1 en el acceso a Zona 3, a un costado de Coloso y Zara.",
      ubicacion: "Zona 1",
      precio_base: 27000,
      material: "Lona sobre bastidor",
      medida_ancho: 2.2,
      medida_alto: 2.82,
    },
    {
      clave: "Z1-3",
      nombre: "Ave en Domo Suburbia",
      descripcion: "Ubicado debajo del domo principal en Zona 1.",
      ubicacion: "Zona 1",
      precio_base: 49000,
      material: "Lona sobre bastidor",
    },
    {
      clave: "Z1-9",
      nombre: "Muro Espectacular entre Zara y Massimo Dutti",
      descripcion: "Ubicado en Zona 3, frente a Sears, de cara al domo principal.",
      ubicacion: "Zona 3",
      precio_base: 50000,
      material: "Lona sobre bastidor",
      medida_ancho: 13.0,
      medida_alto: 3.0,
    },
    {
      clave: "Z2-1",
      nombre: "Antepecho Pasillo a C&A",
      descripcion: "Ubicado en el pasillo de salida de Zona 2 y entrada a Zona 1 por la pista de hielo.",
      ubicacion: "Zona 2",
      precio_base: 58500,
      material: "Vinil",
    },
    {
      clave: "Z3-5",
      nombre: "Escaleras del Domo Principal",
      aliases: { names: ["Escaleras del Domo Principal (2 caras)"] },
      descripcion: "Ubicado en Zona 3, frente a Sears, Zara, Liverpool y la isla de Starbucks (se incluyen las 2 caras).",
      ubicacion: "Zona 3",
      precio_base: 40000,
      material: "Vinil Autoadherible",
      medida_ancho: 9.6,
      medida_alto: 0.57,
    },
    {
      clave: "Z3-6",
      nombre: "Paquete de 10 pendones interiores",
      descripcion: "Ubicados en los principales pasillos de Zona 3, visibles desde primer y segundo piso.",
      ubicacion: "Zona 3",
      precio_base: 50000,
      material: "Lona",
      medida_ancho: 0.7,
      medida_alto: 5.0,
    },
    {
      clave: "Z3-8",
      nombre: "Puente en Pasillo principal",
      descripcion: "Ubicado en el pasillo principal de Zona 3, visible desde primer y segundo piso.",
      ubicacion: "Zona 3",
      precio_base: 42000,
      material: "Lona sobre bastidor",
      medida_ancho: 7.28,
      medida_alto: 1.19,
    },
    {
      clave: "Z3-12",
      nombre: "Espectacular sobre balcón Sears",
      aliases: { names: ["Espectacular sobre balcon Sears"] },
      descripcion: "Ubicado en Zona 1, entre Zara y Massimo Dutti, con vista al pórtico 1.",
      ubicacion: "Zona 1",
      precio_base: 45000,
      material: "Lona sobre bastidor",
    },
    {
      clave: "Z3-21",
      nombre: "Ave en Domo Principal",
      descripcion: "Ubicado debajo del domo principal en Zona 3.",
      ubicacion: "Zona 3",
      precio_base: 51000,
      material: "Lona sobre bastidor",
    },
    {
      clave: "Z4-1",
      nombre: "Cristales Interiores Escaleras Eléctricas",
      descripcion: "Ubicado en Zona 4, frente al acceso del pórtico 4, y acceso a segunda planta hacia Cinemex.",
      ubicacion: "Zona 4",
      precio_base: 40000,
      material: "Vinil Autoadherible",
    },
    {
      clave: "Z4-2",
      nombre: "Cristales Exteriores Escaleras Eléctricas",
      descripcion: "Ubicado en Zona 4, frente al acceso del pórtico 4, y acceso a segunda planta hacia Cinemex.",
      ubicacion: "Zona 4",
      precio_base: 45000,
      material: "Vinil Autoadherible",
      medida_ancho: 2.77,
      medida_alto: 3.65,
    },
    {
      clave: "Z4-2 VAR 2",
      nombre: "Cristales Exteriores Escaleras Eléctricas (Zara Home)",
      aliases: { names: ["Cristales exteriores de escaleras eléctricas (Zara Home)"] },
      descripcion: "Ubicado en Zona 4 frente a Zara Home en el acceso a Zona Moda.",
      ubicacion: "Zona 4",
      precio_base: 40000,
      material: "Vinil Autoadherible",
      medida_ancho: 2.77,
      medida_alto: 3.65,
    },
    {
      clave: "Z4-2 VAR 3",
      nombre: "Cristal Exterior Escaleras Eléctricas (H&M / Zona Moda)",
      aliases: {
        keys: ["Z4-2 VAR"],
        names: ["Cristal exterior de escaleras eléctricas (H&M / Zona Moda)", "Cristal Exterior Escaleras Eléctricas (1 cristal)"],
      },
      descripcion: "Ubicado en Zona 4 frente a H&M en el acceso a Zona Moda.",
      ubicacion: "Zona 4",
      precio_base: 35000,
      material: "Vinil Autoadherible",
    },
    {
      clave: "Z4-3",
      nombre: "Cristal Superior Zona de Cajeros",
      descripcion: "Ubicado en Zona 6, frente a H&M, de cara a la explanada de la fuente y diversas islas.",
      ubicacion: "Zona 6",
      precio_base: 30000,
      material: "Vinil Autoadherible",
    },
    {
      clave: "Z5-2",
      nombre: "Elevador Panorámico",
      aliases: { names: ["Elevador Panoramico"] },
      descripcion: "Ubicado en Zona 5, frente al acceso del pórtico 4, y acceso a segunda planta hacia Cinemex.",
      ubicacion: "Zona 5",
      precio_base: 47000,
      material: "Vinil Autoadherible",
      medida_ancho: 2.14,
      medida_alto: 9.77,
    },
    {
      clave: "Z6-1",
      nombre: "Cristales laterales escaleras Banana Republic",
      descripcion: "Ubicado en Zona 6, de cara al pasillo principal frente a Banana Republic, Stradivarius, etc.",
      ubicacion: "Zona 6",
      precio_base: 40000,
      material: "Vinil Autoadherible",
    },
    {
      clave: "Z6-4",
      nombre: "Dorso de Elevador Zona 6",
      descripcion: "Ubicado en Zona 6, a la salida del subterráneo, de cara al pasillo principal.",
      ubicacion: "Zona 6",
      precio_base: 50000,
      material: "Vinil Autoadherible",
      medida_ancho: 2.8,
      medida_alto: 9.7,
    },
    {
      clave: "Z7-11",
      nombre: "Escaleras Eléctricas Subterráneo Liverpool",
      aliases: {
        keys: ["Z6-1 VAR 2"],
        names: ["Escaleras eléctricas subterráneo Liverpool (2 caras)"],
      },
      descripcion: "Ubicado en Zona 7 a la salida del subterráneo que da a Liverpool, Hills y al foro de ZM (se incluyen ambas caras laterales).",
      ubicacion: "Zona 7",
      precio_base: 32000,
      material: "Vinil Autoadherible",
    },
    {
      clave: "Z7-12",
      nombre: "Puente Central de Pasillo",
      descripcion: "Ubicado en Zona 6, frente a H&M y Vans, de cara a Zona de Cajeros.",
      ubicacion: "Zona 6",
      precio_base: 40000,
      material: "Vinil",
    },
    {
      clave: "Z7-12 VAR 2",
      nombre: "Puente Central de Pasillo (cara a escaleras eléctricas)",
      aliases: { names: ["Puente central de pasillo (cara a escaleras eléctricas)"] },
      descripcion: "Ubicado en Zona 6, frente a H&M y Vans, de cara a escaleras eléctricas.",
      ubicacion: "Zona 6",
      precio_base: 40000,
      material: "Vinil",
    },
    {
      clave: "EST 253 E-F",
      nombre: "Paquete de 5 pendones de estacionamiento",
      descripcion: "Variedad de zonas.",
      ubicacion: "Estacionamiento",
      precio_base: 25000,
      material: "Lona en bastidor",
    },
    {
      clave: "EST 254 E-G",
      nombre: "Paquete de 10 plumas Estacionamiento",
      aliases: { names: ["Paquete de 10 plumas de estacionamiento"] },
      descripcion: "Variedad de zonas.",
      ubicacion: "Estacionamiento",
      precio_base: 40000,
      material: "Vinil",
    },
    {
      clave: "pen-2",
      nombre: "Puerta de elevador",
      aliases: { names: ["Puertas elevadores varias zonas"] },
      descripcion: "Pasillo a Palacio de Hierro, frente a Birkenstock.",
      ubicacion: "Pasillo a Palacio de Hierro",
      precio_base: 20000,
      material: "Vinil adherible",
    },
    {
      clave: "pen-7",
      nombre: "Antepecho Puente conector entre H&M y Mix Up",
      descripcion: "Variedad de zonas.",
      ubicacion: "Varias zonas",
      precio_base: 40000,
      material: "Vinil sobre bastidor",
      etiquetas: ["Puente", "Vinil sobre bastidor"],
    },
    {
      clave: "pen-8",
      nombre: "Mesas Food court",
      aliases: {
        keys: ["123456"],
        names: ["Mesas Food court"],
      },
      descripcion: "Paquete de 30 mesas en Food Court.",
      ubicacion: "Food Court",
      precio_base: 30000,
      material: "Vinil adherible",
    },
  ];

  function findExisting(target) {
    const aliasKeys = (target.aliases && target.aliases.keys) || [];
    const aliasNames = (target.aliases && target.aliases.names) || [];

    const keyCandidates = [target.clave].concat(aliasKeys);
    for (const key of keyCandidates) {
      const expected = normalize(key);
      for (const record of plazaMayorRecords) {
        const id = String(record.get("id") || record.id || "");
        if (used[id]) continue;
        if (normalize(record.get("clave")) === expected) return record;
      }
    }

    const nameCandidates = [target.nombre].concat(aliasNames);
    for (const name of nameCandidates) {
      const expected = normalize(name);
      for (const record of plazaMayorRecords) {
        const id = String(record.get("id") || record.id || "");
        if (used[id]) continue;
        if (normalize(record.get("nombre")) === expected) return record;
      }
    }

    return null;
  }

  function applyTarget(record, target, isNew) {
    const currentWidth = Number(record.get("medida_ancho") || 0);
    const currentHeight = Number(record.get("medida_alto") || 0);
    const hasMeasurements =
      typeof target.medida_ancho === "number" &&
      typeof target.medida_alto === "number";

    record.set("tenant", "plaza_mayor");
    record.set("clave", target.clave);
    record.set("nombre", target.nombre);
    record.set("tipo", "publicitario");
    record.set("descripcion", target.descripcion);
    record.set("ubicacion", target.ubicacion || record.get("ubicacion") || "");
    record.set("precio_base", target.precio_base);
    record.set("material", target.material);
    record.set("activo", true);
    record.set("activa", true);
    record.set("medida_ancho", hasMeasurements ? target.medida_ancho : (isNew ? 0 : currentWidth));
    record.set("medida_alto", hasMeasurements ? target.medida_alto : (isNew ? 0 : currentHeight));
    record.set("medida_unidad", hasMeasurements ? "M" : (isNew ? "" : (record.get("medida_unidad") || "")));

    if (isNew && Array.isArray(target.etiquetas)) {
      record.set("etiquetas", target.etiquetas);
    }
  }

  for (const target of targets) {
    const existing = findExisting(target);
    const record = existing || new Record(collection);

    applyTarget(record, target, !existing);
    app.save(record);

    const id = String(record.get("id") || record.id || "");
    if (id) used[id] = true;
  }
}, (app) => {
  // No automatic rollback for catalog data updates.
});
