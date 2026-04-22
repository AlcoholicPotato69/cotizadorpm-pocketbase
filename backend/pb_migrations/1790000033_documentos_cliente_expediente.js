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

  const documentos = findCollection("documentos");
  const clientes = findCollection("clientes");
  if (!documentos || !clientes) return;

  let clienteField = getField(documentos, "cliente");
  if (!clienteField) {
    clienteField = new RelationField({
      name: "cliente",
      required: false,
      maxSelect: 1,
      collectionId: clientes.id,
      cascadeDelete: true
    });
    documentos.fields.add(clienteField);
  }
  clienteField.required = false;
  clienteField.maxSelect = 1;
  clienteField.collectionId = clientes.id;
  clienteField.cascadeDelete = true;

  let campoField = getField(documentos, "documento_campo");
  if (!campoField) {
    campoField = new TextField({
      name: "documento_campo",
      required: false,
      max: 80
    });
    documentos.fields.add(campoField);
  }
  campoField.required = false;
  campoField.max = 80;

  let estadoField = getField(documentos, "estado");
  if (!estadoField) {
    estadoField = new TextField({
      name: "estado",
      required: false,
      max: 40
    });
    documentos.fields.add(estadoField);
  }
  estadoField.required = false;
  estadoField.max = 40;

  let omitidoField = getField(documentos, "omitido");
  if (!omitidoField) {
    omitidoField = new BoolField({
      name: "omitido",
      required: false
    });
    documentos.fields.add(omitidoField);
  }
  omitidoField.required = false;

  let metadataField = getField(documentos, "metadata");
  if (!metadataField) {
    metadataField = new JSONField({
      name: "metadata",
      required: false,
      maxSize: 0
    });
    documentos.fields.add(metadataField);
  }
  metadataField.required = false;
  metadataField.maxSize = 0;

  const indexes = Array.isArray(documentos.indexes) ? [...documentos.indexes] : [];
  const clientIndex = "CREATE INDEX idx_documentos_tenant_cliente_doc ON documentos (tenant, cliente, documento_campo)";
  if (!indexes.includes(clientIndex)) indexes.push(clientIndex);
  documentos.indexes = indexes;

  app.save(documentos);
}, (_app) => {
  // No-op: conservar estos campos evita perder trazabilidad documental del expediente.
});
