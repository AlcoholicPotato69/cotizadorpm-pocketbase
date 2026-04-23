const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const BACKEND_URL = 'http://127.0.0.1:8090';
const FRONTEND_URL = 'http://127.0.0.1:8080/client';
const TENANT = process.env.TENANT || 'plaza_mayor';
const SUPERUSER_EMAIL = 'codex.temp.20260422+contracts@local.test';
const SUPERUSER_PASSWORD = 'CodexTmp!20260422';
const ARTIFACT_DIR = path.join(process.cwd(), 'scratch', TENANT === 'casa_de_piedra' ? 'modular-doc-artifacts-cp' : 'modular-doc-artifacts');
const CUSTOM_DOC_FIELD = 'doc_custom_informacion_bancaria';
const CUSTOM_DOC_LABEL = 'Información bancaria';
const CUSTOM_UPLOAD_FIELD = `extra_doc__${CUSTOM_DOC_FIELD}`;
const CUSTOM_REJECT_REASON = 'Falta incluir una fecha bancaria válida y legible.';

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
4 0 obj << /Length 160 >> stream
BT
/F1 14 Tf
72 740 Td
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
0000000452 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
522
%%EOF
`;
  return Buffer.from(body, 'utf8');
}

function makeTinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y2d6xgAAAAASUVORK5CYII=',
    'base64'
  );
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BACKEND_URL}${pathname}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!response.ok) {
    const message = data && typeof data === 'object'
      ? (data.message || JSON.stringify(data))
      : String(data || `${response.status} ${response.statusText}`);
    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

function authHeaders(token, extra = {}) {
  return token ? { Authorization: token, ...extra } : { ...extra };
}

async function adminLogin() {
  const payload = { identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD };
  const data = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return String(data?.token || '').trim();
}

async function createAppUser(superToken, state, role) {
  const stamp = `${role}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const email = `codex.${stamp}@local.test`;
  const password = `SmokeFlow!${stamp.slice(-8)}`;
  const permissions = role === 'verificador'
    ? {
        access: true,
        clients_view: true,
        clients_verify: true
      }
    : {
        access: true,
        orders_view: true,
        reports_view: true,
        clients_view: true,
        clients_manage: true,
        clients_verify: true,
        catalog_manage: true
      };
  const payload = {
    email,
    password,
    passwordConfirm: password,
    emailVisibility: false,
    verified: true,
    login_username: stamp,
    role,
    allowed_tenants: [TENANT],
    tenant_default: TENANT,
    app_metadata: {
      finanzas: { permissions }
    }
  };
  const user = await api('/api/collections/app_users/records', {
    method: 'POST',
    headers: authHeaders(superToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.users.push({
    id: user.id,
    email,
    password,
    role,
    username: stamp,
    record: user
  });
  return state.users[state.users.length - 1];
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
    revisado_por_nombre: actor.username,
    revisado_at: approvedAt,
    aprobado_por_id: actor.id,
    aprobado_por_nombre: actor.username,
    aprobado_at: approvedAt
  };
}

async function createClientReadyForQuotes(token, actor, state) {
  const stamp = `cliente-${Date.now()}`;
  const approvedAt = nowIso();
  const clientName = `Cliente Modular ${stamp}`;
  const email = `${stamp}@cliente.test`;
  const phone = '4771234567';
  const rfc = 'XAXX010101000';
  const constanciaDate = dateOnly(-3);
  const comprobanteDate = dateOnly(-8);
  const docStates = {
    doc_acta_constitutiva: buildApprovedDocState(actor, approvedAt),
    doc_ine: buildApprovedDocState(actor, approvedAt),
    doc_comprobante_domicilio: buildApprovedDocState(actor, approvedAt),
    doc_constancia_fiscal: buildApprovedDocState(actor, approvedAt)
  };
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('nombre_completo', clientName);
  form.append('correo', email);
  form.append('telefono', phone);
  form.append('rfc', rfc);
  form.append('documentos_estado', JSON.stringify(docStates));
  form.append('constancia_fiscal_emitida_el', constanciaDate);
  form.append('comprobante_domicilio_emitido_el', `${comprobanteDate} 00:00:00.000Z`);
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
  state.clientPhone = phone;
  state.clientRfc = rfc;
  state.clientEmail = email;
  state.clientName = clientName;
  return client;
}

async function fetchClient(token, clientId) {
  return api(`/api/collections/clientes/records/${encodeURIComponent(clientId)}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
}

async function waitForClient(token, clientId, predicate, timeoutMs = 30000) {
  const startedAt = Date.now();
  let latest = null;
  while ((Date.now() - startedAt) < timeoutMs) {
    latest = await fetchClient(token, clientId);
    if (predicate(latest)) return latest;
    await sleep(800);
  }
  throw new Error(`Tiempo agotado esperando al cliente ${clientId}.`);
}

async function fetchPublicAccessToken(clientId, phone) {
  const response = await fetch(`${BACKEND_URL}/api/cotizador/public-client-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, phone })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.accessToken) {
    throw new Error(data?.message || 'No se pudo obtener access token público.');
  }
  return String(data.accessToken).trim();
}

async function fetchConfigRow(token) {
  const filter = encodeURIComponent(`tenant='${TENANT}' && clave='client_document_requirements'`);
  const data = await api(`/api/collections/configuracion/records?page=1&perPage=5&filter=${filter}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
  return Array.isArray(data.items) ? (data.items[0] || null) : null;
}

function defaultPmDocumentRequirements() {
  return [
    { field: 'doc_acta_constitutiva', label: 'Acta constitutiva', description: 'PDF completo y legible.', icon: 'fa-building-circle-check', requiredForProfile: true, requiredForContract: true, requiresDate: false, allowOmit: true, builtIn: true, custom: false, uploadField: 'doc_acta_constitutiva', accept: '.pdf,.jpg,.jpeg,.png,.webp', requirements: [], order: 0, validityMode: '', validityDays: '', validityMonths: '' },
    { field: 'doc_ine', label: 'INE o identificación', description: 'Identificación oficial vigente.', icon: 'fa-id-card', requiredForProfile: true, requiredForContract: true, requiresDate: false, allowOmit: true, builtIn: true, custom: false, uploadField: 'doc_ine', accept: '.pdf,.jpg,.jpeg,.png,.webp', requirements: [], order: 1, validityMode: '', validityDays: '', validityMonths: '' },
    { field: 'doc_comprobante_domicilio', label: 'Comprobante de domicilio', description: 'Recibo de luz, agua o teléfono vigente.', icon: 'fa-home', requiredForProfile: true, requiredForContract: true, requiresDate: true, allowOmit: true, builtIn: true, custom: false, uploadField: 'doc_comprobante_domicilio', accept: '.pdf,.jpg,.jpeg,.png,.webp', requirements: [], order: 2, validityMode: 'calendar_months', validityMonths: 3, validityDays: '' },
    { field: 'doc_constancia_fiscal', label: 'Constancia de situación fiscal', description: 'PDF oficial del SAT.', icon: 'fa-file-invoice', requiredForProfile: true, requiredForContract: true, requiresDate: true, allowOmit: false, builtIn: true, custom: false, uploadField: 'doc_constancia_fiscal', accept: '.pdf,.jpg,.jpeg,.png,.webp', requirements: [], order: 3, validityMode: 'days', validityDays: 30, validityMonths: '' }
  ];
}

function buildConfigDocuments(existingDocs = null) {
  const baseDocs = Array.isArray(existingDocs) && existingDocs.length
    ? existingDocs.map((item) => ({ ...item }))
    : defaultPmDocumentRequirements();
  const withoutCustom = baseDocs.filter((item) => String(item?.field || '').trim() !== CUSTOM_DOC_FIELD);
  withoutCustom.push({
    field: CUSTOM_DOC_FIELD,
    key: CUSTOM_DOC_FIELD,
    label: CUSTOM_DOC_LABEL,
    description: 'Estado de cuenta o documento bancario vigente.',
    icon: 'fa-building-columns',
    requiredForProfile: false,
    requiredForContract: true,
    requiresDate: true,
    allowOmit: true,
    builtIn: false,
    custom: true,
    uploadField: CUSTOM_UPLOAD_FIELD,
    accept: '.pdf,.jpg,.jpeg,.png,.webp',
    requirements: [],
    order: withoutCustom.length,
    validityMode: '',
    validityDays: '',
    validityMonths: ''
  });
  return withoutCustom.map((item, index) => ({ ...item, order: index }));
}

function buildConfigDocumentsWithoutCustom(existingDocs = null) {
  const baseDocs = Array.isArray(existingDocs) && existingDocs.length
    ? existingDocs.map((item) => ({ ...item }))
    : defaultPmDocumentRequirements();
  return baseDocs
    .filter((item) => String(item?.field || '').trim() !== CUSTOM_DOC_FIELD)
    .map((item, index) => ({ ...item, order: index }));
}

async function ensureConfigWithoutCustom(adminToken, state) {
  const existing = await fetchConfigRow(adminToken);
  if (!state.originalConfigRow) {
    state.originalConfigRow = existing ? JSON.parse(JSON.stringify(existing)) : null;
  }
  if (!existing?.id) return null;
  const existingDocs = Array.isArray(existing?.valor_json?.documents) ? existing.valor_json.documents : [];
  const hasCustom = existingDocs.some((item) => String(item?.field || '').trim() === CUSTOM_DOC_FIELD);
  if (!hasCustom) return existing;
  const payload = {
    tenant: existing.tenant || TENANT,
    clave: existing.clave || 'client_document_requirements',
    valor_json: {
      ...(existing.valor_json || {}),
      documents: buildConfigDocumentsWithoutCustom(existingDocs),
      updated_at: nowIso()
    },
    valor_num: existing.valor_num || 0
  };
  const updated = await api(`/api/collections/configuracion/records/${encodeURIComponent(existing.id)}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.configRowId = updated.id;
  return updated;
}

async function saveConfigRow(adminToken, state) {
  const existing = await fetchConfigRow(adminToken);
  if (!state.originalConfigRow) {
    state.originalConfigRow = existing ? JSON.parse(JSON.stringify(existing)) : null;
  }
  const existingDocs = existing?.valor_json?.documents;
  const payload = {
    tenant: TENANT,
    clave: 'client_document_requirements',
    valor_json: {
      documents: buildConfigDocuments(existingDocs),
      updated_at: nowIso()
    },
    valor_num: 0
  };
  if (existing?.id) {
    const updated = await api(`/api/collections/configuracion/records/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    state.configRowId = updated.id;
    return updated;
  }
  const created = await api('/api/collections/configuracion/records', {
    method: 'POST',
    headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.configRowId = created.id;
  return created;
}

async function restoreConfigRow(superToken, state) {
  if (state.originalConfigRow?.id) {
    await api(`/api/collections/configuracion/records/${encodeURIComponent(state.originalConfigRow.id)}`, {
      method: 'PATCH',
      headers: authHeaders(superToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        tenant: state.originalConfigRow.tenant,
        clave: state.originalConfigRow.clave,
        valor_json: state.originalConfigRow.valor_json || {},
        valor_num: state.originalConfigRow.valor_num || 0
      })
    }).catch(() => {});
    return;
  }
  if (state.configRowId) {
    await api(`/api/collections/configuracion/records/${encodeURIComponent(state.configRowId)}`, {
      method: 'DELETE',
      headers: authHeaders(superToken)
    }).catch(() => {});
  }
}

async function submitPublicProfileForm(formData) {
  const response = await fetch(`${BACKEND_URL}/api/cotizador/public-client-profile/complete`, {
    method: 'POST',
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

async function setCustomDocDecision(token, client, actor, status, reason = '') {
  const states = JSON.parse(JSON.stringify(client.documentos_estado || {}));
  const now = nowIso();
  states[CUSTOM_DOC_FIELD] = {
    ...(states[CUSTOM_DOC_FIELD] || {}),
    status,
    motivo: reason,
    omitido: status === 'omitido',
    actualizado_at: now,
    revisado_at: now,
    revisado_por_id: actor.id,
    revisado_por_nombre: actor.username,
    aprobado_at: status === 'aprobado' ? now : '',
    aprobado_por_id: status === 'aprobado' ? actor.id : '',
    aprobado_por_nombre: status === 'aprobado' ? actor.username : ''
  };
  await api(`/api/collections/clientes/records/${encodeURIComponent(client.id)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ documentos_estado: states })
  });
}

function buildClientSnapshot(client) {
  const validation = client?.expediente_validacion || {};
  const documents = validation.documents || {};
  const requirements = Array.isArray(validation.documentRequirements) ? validation.documentRequirements : [];
  return requirements.map((item) => {
    const field = String(item?.field || '').trim();
    const doc = documents[field] || {};
    return {
      field,
      label: item?.label || field,
      fileName: doc.fileName || '',
      uploaded: doc.uploaded === true,
      status: doc.estado || 'pendiente',
      omitted: doc.omitido === true,
      reason: doc.motivo || '',
      validityDate: doc.fechaDocumento || doc.fecha_documento || '',
      reviewedByName: doc.revisadoPorNombre || doc.aprobadoPorNombre || '',
      reviewedAt: doc.revisadoAt || doc.aprobadoAt || '',
      updatedAt: doc.actualizadoAt || doc.actualizado_at || '',
      updatedFromRejection: doc.actualizadoDesdeRechazo === true || doc.actualizado_desde_rechazo === true
    };
  });
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

async function createApprovedDictamen(token, actor, client, state) {
  const snapshot = buildClientSnapshot(client);
  const documentosHash = sha256Hex(stableStringify({
    tenant: TENANT,
    clientId: client.id,
    documents: snapshot
  }));
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('cliente', client.id);
  form.append('folio', `DF-MOD-${Date.now()}`);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', actor.username);
  form.append('metadata', JSON.stringify({
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: snapshot,
    cliente_nombre: client.nombre_completo,
    source: 'generated',
    approval_status: 'aprobado',
    approved: true,
    generated_by: { id: actor.id, name: actor.username, role: actor.role },
    generated_at: nowIso(),
    reviewed_by: { id: actor.id, name: actor.username, role: actor.role },
    reviewed_at: nowIso(),
    approved_by: { id: actor.id, name: actor.username, role: actor.role },
    approved_at: nowIso()
  }));
  form.append('pdf', new File([makeMinimalPdf(`Dictamen modular ${client.id}`)], `dictamen_${client.id}.pdf`, { type: 'application/pdf' }));
  const row = await api('/api/collections/clientes_dictamenes/records', {
    method: 'POST',
    headers: authHeaders(token),
    body: form
  });
  state.dictamenId = row.id;
  return row;
}

async function openPublicViaGate(page, clientId, phone) {
  await page.goto(`${FRONTEND_URL}/public/perfil_cliente.html`, { waitUntil: 'networkidle' });
  await page.fill('#gate-client-id', clientId);
  await page.fill('#gate-phone', phone);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/cotizador/public-client-verify') && response.request().method() === 'POST'),
    page.locator('#gate-submit-btn').click()
  ]);
  await page.waitForSelector('#main-shell', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const pill = document.getElementById('header-status-pill');
    return !!pill && !/Cargando/i.test(String(pill.textContent || ''));
  }, { timeout: 30000 });
}

async function openPublicWithAccess(page, accessToken) {
  await page.goto(`${FRONTEND_URL}/public/perfil_cliente.html?access=${encodeURIComponent(accessToken)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#main-shell', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const pill = document.getElementById('header-status-pill');
    return !!pill && !/Cargando/i.test(String(pill.textContent || ''));
  }, { timeout: 30000 });
}

async function deleteRecord(token, collection, id) {
  if (!id) return;
  await api(`/api/collections/${collection}/records/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  }).catch(() => {});
}

async function cleanupClientDocuments(token, clientId) {
  if (!clientId) return;
  const filter = encodeURIComponent(`tenant='${TENANT}' && cliente='${clientId}'`);
  const rows = await api(`/api/collections/documentos/records?page=1&perPage=100&filter=${filter}`, {
    method: 'GET',
    headers: authHeaders(token)
  }).catch(() => ({ items: [] }));
  for (const row of Array.isArray(rows.items) ? rows.items : []) {
    await deleteRecord(token, 'documentos', row.id);
  }
}

async function main() {
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true });
  const state = {
    users: [],
    clientId: '',
    clientPhone: '',
    clientEmail: '',
    clientName: '',
    clientRfc: '',
    configRowId: '',
    originalConfigRow: null,
    dictamenId: '',
    accessToken: ''
  };

  const artifactPaths = {
    initialScreenshot: path.join(ARTIFACT_DIR, 'public-initial.png'),
    configScreenshot: path.join(ARTIFACT_DIR, 'public-after-config.png'),
    rejectedScreenshot: path.join(ARTIFACT_DIR, 'public-after-reject.png'),
    approvedScreenshot: path.join(ARTIFACT_DIR, 'public-after-approve.png'),
    pdfInitial: path.join(ARTIFACT_DIR, 'info-bancaria-v1.pdf'),
    pdfCorrected: path.join(ARTIFACT_DIR, 'info-bancaria-v2.pdf'),
    result: path.join(ARTIFACT_DIR, 'latest-modular-doc-result.json')
  };

  const superToken = await adminLogin();
  let browser = null;
  let context = null;
  let page = null;

  try {
    const adminUser = await createAppUser(superToken, state, 'admin');
    const verifierUser = await createAppUser(superToken, state, 'verificador');
    const adminToken = await authAppUser(adminUser.email, adminUser.password);
    const verifierToken = await authAppUser(verifierUser.email, verifierUser.password);
    await ensureConfigWithoutCustom(adminToken, state);

    await fsp.writeFile(artifactPaths.pdfInitial, makeMinimalPdf(`${CUSTOM_DOC_LABEL} Fecha: 15/04/2026`));
    await fsp.writeFile(artifactPaths.pdfCorrected, makeMinimalPdf(`${CUSTOM_DOC_LABEL} Corregido Fecha: 18/04/2026`));

    const createdClient = await createClientReadyForQuotes(adminToken, adminUser, state);
    const quoteReadyClient = await waitForClient(superToken, createdClient.id, (row) => {
      return row?.expediente_validacion?.readyForQuotes === true;
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1200 } });
    page = await context.newPage();

    await openPublicViaGate(page, quoteReadyClient.id, state.clientPhone);
    await page.screenshot({ path: artifactPaths.initialScreenshot, fullPage: true });
    const initialText = await page.locator('body').innerText();
    assert.match(initialText, /correo principal|telefono principal/i, 'El portal público inicial no mostró el estado validado del perfil.');
    assert.ok(!initialText.includes(CUSTOM_DOC_LABEL), 'El documento personalizado ya existía antes de configurar la lista dinámica.');

    const freshAccessToken = await fetchPublicAccessToken(quoteReadyClient.id, state.clientPhone);
    state.accessToken = freshAccessToken;
    await saveConfigRow(adminToken, state);

    await openPublicWithAccess(page, state.accessToken);
    await page.screenshot({ path: artifactPaths.configScreenshot, fullPage: true });
    const configuredText = await page.locator('body').innerText();
    assert.ok(configuredText.includes(CUSTOM_DOC_LABEL), 'El documento personalizado no apareció en perfil_cliente.html tras actualizar la configuración.');
    assert.ok(configuredText.includes('Guardar y validar expediente'), 'El portal público no salió del modo de solo contactos al faltar un documento de contrato.');
    const emailReadOnly = await page.locator('#edit-correo').evaluate((node) => !!node.readOnly);
    const phoneReadOnly = await page.locator('#edit-telefono-principal').evaluate((node) => !!node.readOnly);
    assert.equal(emailReadOnly, false, 'El correo principal quedó bloqueado cuando el perfil validado aún tenía requisitos de contrato pendientes.');
    assert.equal(phoneReadOnly, false, 'El teléfono principal quedó bloqueado cuando el perfil validado aún tenía requisitos de contrato pendientes.');

    const rfcAttempt = new FormData();
    rfcAttempt.append('access', state.accessToken);
    rfcAttempt.append('rfc', 'HACK010101AAA');
    const rfcResult = await submitPublicProfileForm(rfcAttempt);
    assert.equal(rfcResult.ok, true, 'La actualización pública segura del perfil falló al enviar un RFC no permitido.');
    const afterRfcAttempt = await fetchClient(superToken, state.clientId);
    assert.equal(String(afterRfcAttempt.rfc || '').trim(), state.clientRfc, 'El RFC del cliente fue modificado indebidamente desde el portal público.');

    const invalidUpload = new FormData();
    invalidUpload.append('access', state.accessToken);
    invalidUpload.append(`${CUSTOM_UPLOAD_FIELD}_date`, '2026-04-15');
    invalidUpload.append(CUSTOM_UPLOAD_FIELD, new File([makeTinyPng()], 'info-bancaria.png', { type: 'image/png' }));
    const invalidResult = await submitPublicProfileForm(invalidUpload);
    assert.equal(invalidResult.ok, false, 'El endpoint público aceptó un archivo no PDF para un documento con fecha/OCR.');
    assert.equal(invalidResult.status, 400, 'El endpoint público no rechazó con 400 el archivo no permitido.');
    assert.match(String(invalidResult.data?.message || ''), /PDF/i, 'El rechazo del archivo no permitido no explicó la restricción de PDF.');

    await page.fill('#edit-correo', `cliente.modular.${Date.now()}@local.test`);
    await page.fill('#edit-telefono-principal', '4779876543');
    await page.setInputFiles(`#file-${CUSTOM_DOC_FIELD}`, artifactPaths.pdfInitial);
    await page.waitForFunction((field) => {
      const card = document.getElementById(`doc-card-${field}`);
      const text = card ? String(card.innerText || '') : '';
      return !!card && /Listo para guardar|Documento aceptado|validado correctamente/i.test(text);
    }, CUSTOM_DOC_FIELD, { timeout: 30000 });
    const firstSubmit = page.waitForResponse((response) => response.url().includes('/api/cotizador/public-client-profile/complete') && response.request().method() === 'POST');
    await page.locator('#btn-submit').click();
    const firstSubmitResponse = await firstSubmit;
    assert.equal(firstSubmitResponse.ok(), true, 'La carga pública inicial del documento personalizado falló.');

    const afterFirstUpload = await waitForClient(superToken, state.clientId, (row) => {
      const docState = row?.documentos_estado?.[CUSTOM_DOC_FIELD] || {};
      return String(docState.status || '').toLowerCase() === 'pendiente';
    });
    assert.equal(String(afterFirstUpload.correo || '').trim(), await page.locator('#edit-correo').inputValue(), 'El correo principal no se actualizó correctamente desde el portal público.');
    assert.equal(String(afterFirstUpload.telefono || '').trim(), '4779876543', 'El teléfono principal no se actualizó correctamente desde el portal público.');

    await setCustomDocDecision(verifierToken, afterFirstUpload, verifierUser, 'rechazado', CUSTOM_REJECT_REASON);
    const rejectedClient = await waitForClient(superToken, state.clientId, (row) => {
      const docState = row?.documentos_estado?.[CUSTOM_DOC_FIELD] || {};
      return String(docState.status || '').toLowerCase() === 'rechazado';
    });

    await openPublicWithAccess(page, state.accessToken);
    await page.screenshot({ path: artifactPaths.rejectedScreenshot, fullPage: true });
    const rejectedText = await page.locator(`#doc-card-${CUSTOM_DOC_FIELD}`).innerText();
    assert.match(rejectedText, /Rechazado por admin|Rechazado por administración/i, 'El rechazo administrativo no apareció reflejado en el portal público.');
    assert.ok(rejectedText.includes(CUSTOM_REJECT_REASON), 'El motivo de rechazo no apareció en la tarjeta pública del documento.');

    await page.setInputFiles(`#file-${CUSTOM_DOC_FIELD}`, artifactPaths.pdfCorrected);
    await page.waitForFunction((field) => {
      const card = document.getElementById(`doc-card-${field}`);
      const text = card ? String(card.innerText || '') : '';
      return !!card && /Listo para guardar|Documento aceptado|validado correctamente/i.test(text);
    }, CUSTOM_DOC_FIELD, { timeout: 30000 });
    const secondSubmit = page.waitForResponse((response) => response.url().includes('/api/cotizador/public-client-profile/complete') && response.request().method() === 'POST');
    await page.locator('#btn-submit').click();
    const secondSubmitResponse = await secondSubmit;
    assert.equal(secondSubmitResponse.ok(), true, 'La recarga pública del documento corregido falló.');
    const secondSubmitPayload = await secondSubmitResponse.json().catch(() => ({}));
    const secondSubmitDoc = secondSubmitPayload?.profile?.validation?.documents?.[CUSTOM_DOC_FIELD] || {};
    assert.equal(String(secondSubmitDoc.estado || '').toLowerCase(), 'pendiente', 'La respuesta pública del documento corregido no regresó en estado pendiente.');

    const afterSecondUpload = await waitForClient(superToken, state.clientId, (row) => {
      const docState = row?.documentos_estado?.[CUSTOM_DOC_FIELD] || {};
      return String(docState.status || '').toLowerCase() === 'pendiente';
    });
    const secondUploadMarkedAsRetry =
      afterSecondUpload?.documentos_estado?.[CUSTOM_DOC_FIELD]?.actualizado_desde_rechazo === true ||
      secondSubmitDoc.actualizadoDesdeRechazo === true ||
      secondSubmitDoc.actualizado_desde_rechazo === true;
    assert.equal(secondUploadMarkedAsRetry, true, 'El documento corregido no quedó marcado como actualización después de un rechazo.');

    await setCustomDocDecision(adminToken, afterSecondUpload, adminUser, 'aprobado', '');
    const approvedClient = await waitForClient(superToken, state.clientId, (row) => {
      const docState = row?.documentos_estado?.[CUSTOM_DOC_FIELD] || {};
      return String(docState.status || '').toLowerCase() === 'aprobado';
    });
    await createApprovedDictamen(adminToken, adminUser, approvedClient, state);
    const contractReadyClient = await waitForClient(superToken, state.clientId, (row) => {
      const validation = row?.expediente_validacion || {};
      return validation.readyForContracts === true && validation.canGenerateContract === true;
    }, 45000);

    await openPublicWithAccess(page, state.accessToken);
    await page.screenshot({ path: artifactPaths.approvedScreenshot, fullPage: true });
    const approvedText = await page.locator('body').innerText();
    assert.match(approvedText, /correo principal|telefono principal/i, 'El portal público no volvió al modo de datos adicionales tras completar requisitos de contrato.');
    const pendingDocsGridDisplay = await page.locator('#docs-grid').evaluate((node) => getComputedStyle(node).display);
    assert.equal(pendingDocsGridDisplay, 'none', 'La vista pública no ocultó la cuadrícula de documentos pendientes al quedar listo para contrato.');
    const customUploadControlCount = await page.locator(`#file-${CUSTOM_DOC_FIELD}`).count();
    assert.equal(customUploadControlCount, 0, 'El portal público dejó visible un control de carga del documento personalizado cuando ya no faltaban requisitos de contrato.');

    const result = {
      ok: true,
      testedAt: nowIso(),
      users: state.users.map((user) => ({ id: user.id, email: user.email, role: user.role })),
      client: {
        id: contractReadyClient.id,
        nombre: contractReadyClient.nombre_completo,
        correo: contractReadyClient.correo,
        telefono: contractReadyClient.telefono,
        validation: contractReadyClient.expediente_validacion
      },
      artifacts: artifactPaths
    };
    await fsp.writeFile(artifactPaths.result, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
    if (context) {
      try { await context.close(); } catch (_) {}
    }
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }

    await restoreConfigRow(superToken, state);
    await cleanupClientDocuments(superToken, state.clientId);
    await deleteRecord(superToken, 'clientes_dictamenes', state.dictamenId);
    await deleteRecord(superToken, 'clientes', state.clientId);
    for (const user of state.users) {
      await deleteRecord(superToken, 'app_users', user.id);
    }
  }
}

main().catch(async (error) => {
  const target = path.join(ARTIFACT_DIR, 'latest-modular-doc-result.json');
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true }).catch(() => {});
  await fsp.writeFile(target, JSON.stringify({
    ok: false,
    testedAt: nowIso(),
    error: {
      message: error?.message || String(error),
      stack: error?.stack || ''
    }
  }, null, 2), 'utf8').catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
