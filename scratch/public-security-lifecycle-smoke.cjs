const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

const BACKEND_URL = 'http://127.0.0.1:8090';
const TENANT = process.env.TENANT || 'plaza_mayor';
const SUPERUSER_EMAIL = 'codex.temp.20260422+contracts@local.test';
const SUPERUSER_PASSWORD = 'CodexTmp!20260422';
const ARTIFACT_DIR = path.join(process.cwd(), 'scratch', 'security-lifecycle-artifacts');

const TENANT_CONFIG = {
  plaza_mayor: {
    prefix: 'PM',
    spaceId: 'zq4iwlluy0lg2zk',
    spaceName: 'Ave en Domo Suburbia',
    spaceKey: 'Z1-3',
    price: 49000
  },
  casa_de_piedra: {
    prefix: 'CP',
    spaceId: '9fa9z06pkomuv2h',
    spaceName: 'Jardin Principal',
    spaceKey: '01',
    price: 145000
  }
};

const CONFIG = TENANT_CONFIG[TENANT] || TENANT_CONFIG.plaza_mayor;

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(offsetDays = 0) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeMinimalPdf(label) {
  const safeLabel = String(label || 'PDF').replace(/[^\x20-\x7E]/g, ' ');
  const body = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 73 >> stream
BT
/F1 18 Tf
72 720 Td
(${safeLabel}) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000365 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
435
%%EOF
`;
  return Buffer.from(body, 'utf8');
}

function makeXml(label) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><factura><folio>${label}</folio></factura>`, 'utf8');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function rawApi(pathname, options = {}) {
  const response = await fetch(`${BACKEND_URL}${pathname}`, options);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    data,
    text,
    bytes: buffer.length
  };
}

async function api(pathname, options = {}) {
  const response = await rawApi(pathname, options);
  if (!response.ok) {
    const data = response.data;
    const message = data && typeof data === 'object'
      ? (data.message || JSON.stringify(data))
      : String(data || `${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return response.data;
}

function authHeaders(token, extra = {}) {
  return token ? { Authorization: token, ...extra } : { ...extra };
}

async function adminLogin() {
  const data = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD })
  });
  return String(data?.token || '').trim();
}

async function createAppUser(superToken, state) {
  const stamp = `lifecycle-${TENANT}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const email = `codex.${stamp}@local.test`;
  const password = `Lifecycle!${stamp.slice(-8)}`;
  const payload = {
    email,
    password,
    passwordConfirm: password,
    emailVisibility: false,
    verified: true,
    login_username: stamp,
    role: 'admin',
    allowed_tenants: [TENANT],
    tenant_default: TENANT,
    app_metadata: {
      finanzas: {
        permissions: {
          access: true,
          orders_view: true,
          reports_view: true,
          clients_view: true,
          clients_manage: true,
          clients_verify: true,
          catalog_manage: true
        }
      }
    }
  };
  const user = await api('/api/collections/app_users/records', {
    method: 'POST',
    headers: authHeaders(superToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.appUserId = user.id;
  state.appUserEmail = email;
  state.appUserPassword = password;
  state.appUserUsername = stamp;
  return { ...user, email, password, login_username: stamp };
}

async function authAppUser(email, password) {
  const data = await api('/api/collections/app_users/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password })
  });
  return String(data?.token || '').trim();
}

function buildApprovedDocState(actor, approvedAt) {
  return {
    status: 'aprobado',
    motivo: '',
    omitido: false,
    subido_at: approvedAt,
    actualizado_at: approvedAt,
    actualizado_desde_rechazo: false,
    revisado_por_id: actor.id,
    revisado_por_nombre: actor.login_username,
    revisado_at: approvedAt,
    aprobado_por_id: actor.id,
    aprobado_por_nombre: actor.login_username,
    aprobado_at: approvedAt
  };
}

async function createClient(token, actor, state) {
  const stamp = `cliente-lifecycle-${Date.now()}`;
  const approvedAt = nowIso();
  const clientName = `Cliente Lifecycle ${CONFIG.prefix} ${stamp}`;
  const email = `${stamp}@cliente.test`;
  const phone = '4771234567';
  const rfc = 'XAXX010101000';
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('nombre_completo', clientName);
  form.append('correo', email);
  form.append('telefono', phone);
  form.append('rfc', rfc);
  form.append('documentos_estado', JSON.stringify({
    doc_acta_constitutiva: buildApprovedDocState(actor, approvedAt),
    doc_ine: buildApprovedDocState(actor, approvedAt),
    doc_comprobante_domicilio: buildApprovedDocState(actor, approvedAt),
    doc_constancia_fiscal: buildApprovedDocState(actor, approvedAt)
  }));
  form.append('constancia_fiscal_emitida_el', dateOnly(-3));
  form.append('comprobante_domicilio_emitido_el', `${dateOnly(-8)} 00:00:00.000Z`);
  form.append('doc_acta_constitutiva', new File([makeMinimalPdf(`Acta ${stamp}`)], `acta_${stamp}.pdf`, { type: 'application/pdf' }));
  form.append('doc_ine', new File([makeMinimalPdf(`INE ${stamp}`)], `ine_${stamp}.pdf`, { type: 'application/pdf' }));
  form.append('doc_comprobante_domicilio', new File([makeMinimalPdf(`Comprobante ${stamp}`)], `comprobante_${stamp}.pdf`, { type: 'application/pdf' }));
  form.append('doc_constancia_fiscal', new File([makeMinimalPdf(`Constancia ${stamp}`)], `constancia_${stamp}.pdf`, { type: 'application/pdf' }));
  const client = await api('/api/collections/clientes/records', {
    method: 'POST',
    headers: authHeaders(token),
    body: form
  });
  state.clientId = client.id;
  state.clientName = clientName;
  state.clientPhone = phone;
  return client;
}

async function fetchConfigRow(token) {
  const filter = encodeURIComponent(`tenant='${TENANT}' && clave='client_document_requirements'`);
  const data = await api(`/api/collections/configuracion/records?page=1&perPage=5&filter=${filter}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
  return Array.isArray(data.items) ? (data.items[0] || null) : null;
}

function getRequiredCustomContractDocs(configRow) {
  const docs = Array.isArray(configRow?.valor_json?.documents) ? configRow.valor_json.documents : [];
  return docs.filter((item) => {
    const field = String(item?.field || '').trim();
    return field.startsWith('doc_custom_')
      && item?.requiredForContract !== false
      && item?.enabled !== false;
  });
}

async function uploadApprovedCustomContractDocs(token, client, actor) {
  const configRow = await fetchConfigRow(token);
  const customDocs = getRequiredCustomContractDocs(configRow);
  if (!customDocs.length) return client;

  const approvedAt = nowIso();
  const nextStates = JSON.parse(JSON.stringify(client.documentos_estado || {}));
  for (let index = 0; index < customDocs.length; index += 1) {
    const definition = customDocs[index] || {};
    const field = String(definition.field || '').trim();
    if (!field) continue;
    const fileName = `${field}_${actor.login_username}.pdf`;
    const emittedDate = definition.requiresDate === true ? dateOnly(-(index + 5)) : '';
    const ruta = `clientes/${TENANT}/${client.id}/${field}/${fileName}`;
    const metadata = {
      source: 'lifecycle_security_smoke',
      tenant: TENANT,
      cliente_id: client.id,
      cliente_nombre: client.nombre_completo,
      documento_campo: field,
      documento_nombre: definition.label || field,
      estado: 'aprobado',
      omitido: false,
      vigente: true,
      historico: false,
      file_name: fileName,
      emitted_at: emittedDate,
      updated_at: approvedAt,
      updated_from_rejection: false,
      reason: ''
    };
    const form = new FormData();
    form.append('tenant', TENANT);
    form.append('tipo', 'otro');
    form.append('nombre_original', fileName);
    form.append('ruta', ruta);
    form.append('cotizacion_id', '');
    form.append('cliente', client.id);
    form.append('documento_campo', field);
    form.append('estado', 'aprobado');
    form.append('omitido', 'false');
    form.append('vigente', 'true');
    form.append('metadata', JSON.stringify(metadata));
    form.append('archivo', new File([makeMinimalPdf(`${definition.label || field} ${emittedDate || approvedAt}`)], fileName, { type: 'application/pdf' }));
    await api('/api/collections/documentos/records', {
      method: 'POST',
      headers: authHeaders(token),
      body: form
    });
    nextStates[field] = {
      ...buildApprovedDocState(actor, approvedAt),
      ...(emittedDate ? { fecha_documento: emittedDate } : {})
    };
  }

  await api(`/api/collections/clientes/records/${encodeURIComponent(client.id)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ documentos_estado: nextStates })
  });
  return fetchClient(token, client.id);
}

function buildClientSnapshot(client) {
  const states = client.documentos_estado || {};
  return [
    ['doc_acta_constitutiva', 'Acta constitutiva'],
    ['doc_ine', 'INE'],
    ['doc_comprobante_domicilio', 'Comprobante de domicilio'],
    ['doc_constancia_fiscal', 'Constancia de situacion fiscal']
  ].map(([field, label]) => ({
    field,
    label,
    fileName: Array.isArray(client[field]) ? String(client[field][0] || '') : String(client[field] || ''),
    uploaded: true,
    status: String(states[field]?.status || 'aprobado'),
    omitted: states[field]?.omitido === true,
    reason: String(states[field]?.motivo || ''),
    validityDate: field === 'doc_comprobante_domicilio'
      ? dateOnly(-8)
      : (field === 'doc_constancia_fiscal' ? dateOnly(-3) : ''),
    reviewedByName: String(states[field]?.revisado_por_nombre || ''),
    reviewedAt: String(states[field]?.revisado_at || ''),
    updatedAt: String(states[field]?.actualizado_at || ''),
    updatedFromRejection: states[field]?.actualizado_desde_rechazo === true
  }));
}

async function createDictamen(token, client, actor, state) {
  const snapshot = buildClientSnapshot(client);
  const documentosHash = sha256Hex(stableStringify({
    tenant: TENANT,
    clientId: client.id,
    documents: snapshot
  }));
  const generatedAt = nowIso();
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('cliente', client.id);
  form.append('folio', `${CONFIG.prefix}-DF-${Date.now()}`);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', actor.login_username);
  form.append('metadata', JSON.stringify({
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: snapshot,
    cliente_nombre: client.nombre_completo,
    source: 'generated',
    approval_status: 'aprobado',
    approved: true,
    generated_by: { id: actor.id, name: actor.login_username, role: actor.role },
    generated_at: generatedAt,
    reviewed_by: { id: actor.id, name: actor.login_username, role: actor.role },
    reviewed_at: generatedAt,
    approved_by: { id: actor.id, name: actor.login_username, role: actor.role },
    approved_at: generatedAt
  }));
  form.append('pdf', new File([makeMinimalPdf(`Dictamen ${client.id}`)], `dictamen_${client.id}.pdf`, { type: 'application/pdf' }));
  const dictamen = await api('/api/collections/clientes_dictamenes/records', {
    method: 'POST',
    headers: authHeaders(token),
    body: form
  });
  state.dictamenId = dictamen.id;
  return dictamen;
}

async function fetchClient(token, clientId) {
  return api(`/api/collections/clientes/records/${encodeURIComponent(clientId)}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
}

async function waitForClientReadiness(token, clientId, timeoutMs = 25000) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await fetchClient(token, clientId);
    const validation = latest.expediente_validacion || {};
    if (validation.readyForQuotes === true && validation.readyForContracts === true) return latest;
    await sleep(700);
  }
  return latest;
}

async function createQuote(token, client, actor, state) {
  const startDate = dateOnly(20);
  const endDate = dateOnly(21);
  const detail = {
    espacio_id: CONFIG.spaceId,
    espacio_nombre: CONFIG.spaceName,
    espacio_clave: CONFIG.spaceKey,
    espacio_tipo: 'publicidad',
    tipo: 'publicidad',
    fecha_inicio: startDate,
    fecha_fin: endDate,
    fechas_evento: [startDate, endDate],
    personas: 80,
    subtotal_espacio: CONFIG.price,
    total_espacio: CONFIG.price,
    impuestos_total: 0
  };
  const numeroOrden = `${CONFIG.prefix}-LC-${String(Date.now()).slice(-6)}`;
  const payload = {
    tenant: TENANT,
    cliente_id: client.id,
    cliente_nombre: client.nombre_completo,
    cliente_rfc: client.rfc,
    cliente_contacto: client.telefono,
    cliente_email: client.correo,
    cliente_telefono: client.telefono,
    espacio_id: CONFIG.spaceId,
    espacio_nombre: CONFIG.spaceName,
    espacio_clave: CONFIG.spaceKey,
    fecha_inicio: startDate,
    fecha_fin: endDate,
    precio_final: CONFIG.price,
    desglose_precios: {
      subtotal_antes_impuestos: CONFIG.price,
      tax_total: 0,
      auto_calculado: CONFIG.price,
      precio_final_usado: CONFIG.price,
      impuestos_detalle: [],
      espacios: [detail]
    },
    status: 'pendiente',
    numero_orden: numeroOrden,
    datos_fiscales: {
      rfc_receptor: client.rfc,
      razon_social_receptor: client.nombre_completo,
      correo_receptor: client.correo
    },
    conceptos_adicionales: [],
    tipo_ajuste: 'ninguno',
    valor_ajuste: 0,
    ajuste_es_porcentaje: false,
    desglose_impuestos: [],
    historial_pagos: [],
    datos_factura: {},
    personas: 80,
    detalles_evento: { multi_espacio: false, total_espacios: 1 },
    espacios_detalle: [detail],
    nombre_cotizacion: `Lifecycle ${CONFIG.prefix} ${state.appUserUsername}`,
    permanencia_personalizada: false,
    creado_por: actor.id,
    creado_por_nombre: actor.login_username,
    modificado_por: actor.id,
    modificado_por_nombre: actor.login_username,
    flujo_estado: 'onboarding_cliente'
  };
  const quote = await api('/api/collections/cotizaciones/records', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.quoteId = quote.id;
  state.numeroOrden = numeroOrden;
  return quote;
}

async function patchQuoteForm(token, quoteId, fields, files = []) {
  const form = new FormData();
  Object.entries(fields || {}).forEach(([key, value]) => {
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  files.forEach((file) => {
    form.append(file.field, new File([file.bytes], file.name, { type: file.type }));
  });
  return api(`/api/collections/cotizaciones/records/${encodeURIComponent(quoteId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: form
  });
}

async function runQuoteLifecycle(token, quote, actor, state) {
  await patchQuoteForm(token, quote.id, {
    status: 'aprobada',
    flujo_estado: 'cotizacion_aprobada',
    modificado_por: actor.id,
    modificado_por_nombre: actor.login_username,
    fecha_orden_compra: nowIso()
  }, [
    { field: 'cotizacion_final_file', name: `cotizacion_${quote.id}.pdf`, type: 'application/pdf', bytes: makeMinimalPdf(`Cotizacion ${quote.id}`) },
    { field: 'orden_compra_file', name: `orden_${quote.id}.pdf`, type: 'application/pdf', bytes: makeMinimalPdf(`Orden compra ${quote.id}`) }
  ]);
  await patchQuoteForm(token, quote.id, {
    numero_contrato: `${CONFIG.prefix}-CT-${String(Date.now()).slice(-6)}`,
    flujo_estado: 'contrato_firmado',
    modificado_por: actor.id,
    modificado_por_nombre: actor.login_username
  }, [
    { field: 'contrato_file', name: `contrato_${quote.id}.pdf`, type: 'application/pdf', bytes: makeMinimalPdf(`Contrato ${quote.id}`) }
  ]);
  await patchQuoteForm(token, quote.id, {
    status: 'finalizada',
    flujo_estado: 'completado',
    datos_factura: {
      uuid: `SMOKE-${CONFIG.prefix}-${Date.now()}`,
      serie: CONFIG.prefix,
      folio: String(Date.now()).slice(-6),
      emitida_at: nowIso()
    },
    historial_pagos: [],
    modificado_por: actor.id,
    modificado_por_nombre: actor.login_username
  }, [
    { field: 'factura_pdf_file', name: `factura_${quote.id}.pdf`, type: 'application/pdf', bytes: makeMinimalPdf(`Factura ${quote.id}`) },
    { field: 'factura_xml_file', name: `factura_${quote.id}.xml`, type: 'application/xml', bytes: makeXml(quote.id) }
  ]);
  return api(`/api/collections/cotizaciones/records/${encodeURIComponent(quote.id)}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
}

function hasStoredFile(value) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim());
  return !!String(value || '').trim();
}

async function fetchPublicAccessToken(clientId, phone) {
  const data = await api('/api/cotizador/public-client-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, phone })
  });
  return String(data?.accessToken || '').trim();
}

async function fetchPublicProfile(accessToken) {
  const data = await api(`/api/cotizador/public-client-profile?access=${encodeURIComponent(accessToken)}`);
  return data?.profile || {};
}

async function fetchPublicFile(accessToken, quoteId, kind) {
  return rawApi(`/api/cotizador/public-client-file?access=${encodeURIComponent(accessToken)}&quoteId=${encodeURIComponent(quoteId)}&kind=${encodeURIComponent(kind)}`);
}

async function queryMovements(token, state) {
  const filter = `tenant='${TENANT}' && (cliente_id='${state.clientId}' || cotizacion_id='${state.quoteId}' || entidad_id='${state.dictamenId}')`;
  const data = await api(`/api/collections/control_movimientos/records?page=1&perPage=200&sort=-created_at&filter=${encodeURIComponent(filter)}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
  return Array.isArray(data.items) ? data.items : [];
}

async function deleteRecord(token, collection, id) {
  if (!id) return;
  await rawApi(`/api/collections/${collection}/records/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  }).catch(() => {});
}

async function cleanupDocuments(token, state) {
  const filters = [];
  if (state.clientId) filters.push(`cliente='${state.clientId}'`);
  if (state.quoteId) filters.push(`cotizacion_id='${state.quoteId}'`);
  for (const filter of filters) {
    const data = await rawApi(`/api/collections/documentos/records?page=1&perPage=200&filter=${encodeURIComponent(filter)}`, {
      method: 'GET',
      headers: authHeaders(token)
    });
    const items = Array.isArray(data.data?.items) ? data.data.items : [];
    for (const item of items) {
      await deleteRecord(token, 'documentos', item.id);
    }
  }
}

async function writeResult(name, payload) {
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true });
  const filePath = path.join(ARTIFACT_DIR, name);
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main() {
  const state = {
    tenant: TENANT,
    appUserId: '',
    appUserEmail: '',
    appUserPassword: '',
    appUserUsername: '',
    clientId: '',
    clientName: '',
    clientPhone: '',
    dictamenId: '',
    quoteId: '',
    numeroOrden: ''
  };
  let superToken = '';
  let appToken = '';
  let resultPath = '';
  try {
    superToken = await adminLogin();
    const actor = await createAppUser(superToken, state);
    appToken = await authAppUser(state.appUserEmail, state.appUserPassword);
    let client = await createClient(appToken, actor, state);
    client = await uploadApprovedCustomContractDocs(appToken, client, actor);
    await createDictamen(appToken, client, actor, state);
    const readyClient = await waitForClientReadiness(appToken, client.id);
    assert.ok(readyClient, 'No se pudo recuperar el cliente temporal.');
    assert.equal(readyClient.expediente_validacion?.readyForQuotes, true, 'El cliente no quedo listo para cotizar.');
    assert.equal(readyClient.expediente_validacion?.readyForContracts, true, 'El cliente no quedo listo para contratos.');

    const quote = await createQuote(appToken, readyClient, actor, state);
    await runQuoteLifecycle(appToken, quote, actor, state);
    const finalQuote = await api(`/api/collections/cotizaciones/records/${encodeURIComponent(quote.id)}`, {
      method: 'GET',
      headers: authHeaders(superToken)
    });
    assert.equal(finalQuote.status, 'finalizada', 'La cotizacion no quedo finalizada.');
    assert.equal(finalQuote.flujo_estado, 'completado', 'La cotizacion no quedo en flujo completado.');
    assert.ok(hasStoredFile(finalQuote.cotizacion_final_file), 'Falta archivo de cotizacion final.');
    assert.ok(hasStoredFile(finalQuote.orden_compra_file), 'Falta archivo interno de orden de compra.');
    assert.ok(hasStoredFile(finalQuote.contrato_file), 'Falta archivo de contrato.');
    assert.ok(hasStoredFile(finalQuote.factura_pdf_file), 'Falta PDF de factura.');
    assert.ok(hasStoredFile(finalQuote.factura_xml_file), 'Falta XML de factura.');

    const accessToken = await fetchPublicAccessToken(state.clientId, state.clientPhone);
    const publicProfile = await fetchPublicProfile(accessToken);
    const publicQuote = (publicProfile.quotes || []).find((item) => item.id === state.quoteId);
    assert.ok(publicQuote, 'El perfil publico no muestra la cotizacion finalizada del cliente.');
    assert.equal(publicQuote.status, 'finalizada', 'El perfil publico no muestra la cotizacion como finalizada.');
    assert.equal(publicQuote.flujoEstado, 'completado', 'El perfil publico no muestra flujo completado.');
    assert.equal(Object.prototype.hasOwnProperty.call(publicQuote.documents || {}, 'ordenCompra'), false, 'El perfil publico expone ordenCompra.');
    const publicText = JSON.stringify(publicProfile).toLowerCase();
    assert.equal(publicText.includes('dictamen'), false, 'El perfil publico contiene datos de dictamen.');
    assert.equal(publicText.includes('orden_compra'), false, 'El perfil publico contiene orden_compra.');

    const cotizacionFile = await fetchPublicFile(accessToken, state.quoteId, 'cotizacion');
    const contratoFile = await fetchPublicFile(accessToken, state.quoteId, 'contrato');
    const facturaPdfFile = await fetchPublicFile(accessToken, state.quoteId, 'factura_pdf');
    const facturaXmlFile = await fetchPublicFile(accessToken, state.quoteId, 'factura_xml');
    const ordenCompraFile = await fetchPublicFile(accessToken, state.quoteId, 'orden_compra');
    assert.equal(cotizacionFile.status, 200, 'No se pudo descargar cotizacion publica.');
    assert.equal(contratoFile.status, 200, 'No se pudo descargar contrato publico.');
    assert.equal(facturaPdfFile.status, 200, 'No se pudo descargar factura PDF publica.');
    assert.equal(facturaXmlFile.status, 200, 'No se pudo descargar factura XML publica.');
    assert.equal(ordenCompraFile.status, 404, 'La orden de compra interna quedo descargable publicamente.');

    const movements = await queryMovements(superToken, state);
    const movementTypes = new Set(movements.map((item) => item.tipo_movimiento));
    assert.ok(movementTypes.has('cliente_creado'), 'Control no registro cliente_creado.');
    assert.ok(movementTypes.has('dictamen_creado'), 'Control no registro dictamen_creado.');
    assert.ok(movementTypes.has('cotizacion_creada'), 'Control no registro cotizacion_creada.');
    assert.ok(
      movementTypes.has('cotizacion_actualizada') || movementTypes.has('modificacion_precio'),
      'Control no registro actualizaciones de cotizacion.'
    );
    assert.ok(
      movements.every((item) => /\d{2}:\d{2}:\d{2}/.test(String(item.created_at || ''))),
      'Alguna fecha de control no incluye hora con minutos y segundos.'
    );

    const result = {
      ok: true,
      testedAt: nowIso(),
      tenant: TENANT,
      appUser: {
        id: state.appUserId,
        email: state.appUserEmail,
        username: state.appUserUsername
      },
      client: {
        id: state.clientId,
        nombre: state.clientName,
        validation: readyClient.expediente_validacion
      },
      dictamen: {
        id: state.dictamenId
      },
      quote: {
        id: finalQuote.id,
        numero_orden: finalQuote.numero_orden,
        numero_contrato: finalQuote.numero_contrato,
        status: finalQuote.status,
        flujo_estado: finalQuote.flujo_estado,
        files: {
          cotizacion_final_file: finalQuote.cotizacion_final_file,
          orden_compra_file: finalQuote.orden_compra_file,
          contrato_file: finalQuote.contrato_file,
          factura_pdf_file: finalQuote.factura_pdf_file,
          factura_xml_file: finalQuote.factura_xml_file
        }
      },
      publicProfileChecks: {
        quoteVisible: true,
        ordenCompraHiddenFromJson: true,
        dictamenHiddenFromJson: true,
        ordenCompraDownloadStatus: ordenCompraFile.status,
        cotizacionDownloadStatus: cotizacionFile.status,
        contratoDownloadStatus: contratoFile.status,
        facturaPdfDownloadStatus: facturaPdfFile.status,
        facturaXmlDownloadStatus: facturaXmlFile.status
      },
      controlMovements: movements.map((item) => ({
        id: item.id,
        tipo_movimiento: item.tipo_movimiento,
        entidad_tipo: item.entidad_tipo,
        cliente_id: item.cliente_id,
        cotizacion_id: item.cotizacion_id,
        entidad_id: item.entidad_id,
        actor_nombre: item.actor_nombre,
        actor_role: item.actor_role,
        created_at: item.created_at,
        resumen: item.resumen
      }))
    };
    resultPath = await writeResult(`public-security-lifecycle-${TENANT}.json`, result);
    await writeResult(`latest-${TENANT}.json`, result);
    console.log(JSON.stringify({
      ok: true,
      tenant: TENANT,
      clientId: state.clientId,
      quoteId: state.quoteId,
      dictamenId: state.dictamenId,
      status: finalQuote.status,
      flujoEstado: finalQuote.flujo_estado,
      ordenCompraDownloadStatus: ordenCompraFile.status,
      movements: Array.from(movementTypes).sort(),
      artifact: resultPath
    }, null, 2));
  } catch (error) {
    const failure = {
      ok: false,
      testedAt: nowIso(),
      tenant: TENANT,
      state,
      error: {
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : ''
      }
    };
    resultPath = await writeResult(`public-security-lifecycle-${TENANT}-failed.json`, failure);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (superToken) {
      await cleanupDocuments(superToken, state);
      await deleteRecord(superToken, 'cotizaciones', state.quoteId);
      await deleteRecord(superToken, 'clientes_dictamenes', state.dictamenId);
      await deleteRecord(superToken, 'clientes', state.clientId);
      await deleteRecord(superToken, 'app_users', state.appUserId);
      if (resultPath && fs.existsSync(resultPath)) {
        const marker = await fsp.readFile(resultPath, 'utf8').catch(() => '');
        if (marker) await fsp.writeFile(resultPath, marker, 'utf8');
      }
    }
  }
}

main();
