/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const findCollection = (name) => {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  };

  const getField = (collection, name) => {
    if (!collection) return null;
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  };

  const clientes = findCollection("clientes");
  if (clientes) {
    let dictamenField = getField(clientes, "dictamen");
    if (!dictamenField) {
      dictamenField = new JSONField({
        name: "dictamen",
        required: false
      });
      clientes.fields.add(dictamenField);
    }
    dictamenField.required = false;
    app.save(clientes);
  }

  const documentos = findCollection("documentos");
  if (documentos) {
    let vigenteField = getField(documentos, "vigente");
    if (!vigenteField) {
      vigenteField = new BoolField({
        name: "vigente",
        required: false
      });
      documentos.fields.add(vigenteField);
    }
    vigenteField.required = false;

    const indexes = Array.isArray(documentos.indexes) ? [...documentos.indexes] : [];
    const trackingIndex = "CREATE INDEX idx_documentos_tenant_cliente_doc_vigente ON documentos (tenant, cliente, documento_campo, vigente)";
    if (!indexes.includes(trackingIndex)) indexes.push(trackingIndex);
    documentos.indexes = indexes;
    app.save(documentos);
  }
}, (_app) => {
  // No-op: mantener estos campos evita perder trazabilidad del expediente.
});
