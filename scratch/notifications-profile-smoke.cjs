const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const BACKEND_URL = 'http://127.0.0.1:8090';
const FRONTEND_URL = 'http://127.0.0.1:8080/client';
const TENANT = process.env.TENANT || 'plaza_mayor';
const SUPERUSER_EMAIL = 'codex.temp.20260422+contracts@local.test';
const SUPERUSER_PASSWORD = 'CodexTmp!20260422';
const ARTIFACT_DIR = path.join(
  process.cwd(),
  'scratch',
  TENANT === 'casa_de_piedra' ? 'notif-profile-artifacts-cp' : 'notif-profile-artifacts'
);

const TENANT_CONFIG = {
  plaza_mayor: {
    tenantPath: 'cotizador',
    prefix: 'PM',
    spaceId: 'zq4iwlluy0lg2zk',
    spaceName: 'Ave en Domo Suburbia',
    spaceKey: 'Z1-3',
    price: 49000
  },
  casa_de_piedra: {
    tenantPath: 'cotizadorcp',
    prefix: 'CP',
    spaceId: '9fa9z06pkomuv2h',
    spaceName: 'Jardin Principal',
    spaceKey: '01',
    price: 145000
  }
};

const CONFIG = TENANT_CONFIG[TENANT] || TENANT_CONFIG.plaza_mayor;
const REJECTION_REASON = 'Documento vencido en la revision automatizada.';
const CUSTOM_DOC_FIELD = 'doc_custom_informacion_bancaria';
const CUSTOM_UPLOAD_FIELD = `extra_doc__${CUSTOM_DOC_FIELD}`;

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
4 0 obj << /Length 90 >> stream
BT
/F1 16 Tf
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
0000000382 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
452
%%EOF
`;
  return Buffer.from(body, 'utf8');
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
  const data = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD })
  });
  return String(data?.token || '').trim();
}

async function createAppUser(superToken, state) {
  const stamp = `notif-${TENANT}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const email = `codex.${stamp}@local.test`;
  const password = `NotifFlow!${stamp.slice(-8)}`;
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
  return { ...user, email, password, username: stamp };
}

async function authAppUser(email, password) {
  const data = await api('/api/collections/app_users/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password })
  });
  return String(data?.token || '').trim();
}

function buildApprovedDocState(appUser, approvedAt) {
  return {
    status: 'aprobado',
    motivo: '',
    omitido: false,
    subido_at: approvedAt,
    actualizado_at: approvedAt,
    actualizado_desde_rechazo: false,
    revisado_por_id: appUser.id,
    revisado_por_nombre: appUser.username,
    revisado_at: approvedAt,
    aprobado_por_id: appUser.id,
    aprobado_por_nombre: appUser.username,
    aprobado_at: approvedAt
  };
}

async function createClientReady(token, appUser, holder) {
  const stamp = `cliente-notif-${Date.now()}`;
  const approvedAt = nowIso();
  const clientName = `Cliente Notificaciones ${CONFIG.prefix} ${stamp}`;
  const phone = '4775550101';
  const email = `${stamp}@cliente.test`;
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('nombre_completo', clientName);
  form.append('correo', email);
  form.append('telefono', phone);
  form.append('rfc', 'XAXX010101000');
  form.append('documentos_estado', JSON.stringify({
    doc_acta_constitutiva: buildApprovedDocState(appUser, approvedAt),
    doc_ine: buildApprovedDocState(appUser, approvedAt),
    doc_comprobante_domicilio: buildApprovedDocState(appUser, approvedAt),
    doc_constancia_fiscal: buildApprovedDocState(appUser, approvedAt)
  }));
  form.append('constancia_fiscal_emitida_el', dateOnly(-4));
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
  if (holder && typeof holder === 'object') {
    holder.clientId = client.id;
    holder.clientName = clientName;
    holder.clientPhone = phone;
  }
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
  while ((Date.now() - startedAt) < timeoutMs) {
    const client = await fetchClient(token, clientId);
    if (predicate(client)) return client;
    await sleep(800);
  }
  throw new Error(`Tiempo agotado esperando al cliente ${clientId}.`);
}

function buildClientSnapshot(clientRecord) {
  const validation = clientRecord?.expediente_validacion || {};
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

async function createDictamen(token, clientRecord, appUser, state) {
  const snapshot = buildClientSnapshot(clientRecord);
  const documentosHash = sha256Hex(stableStringify({
    tenant: TENANT,
    clientId: clientRecord.id,
    documents: snapshot
  }));
  const generatedAt = nowIso();
  const metadata = {
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: snapshot,
    cliente_nombre: clientRecord.nombre_completo,
    source: 'generated',
    approval_status: 'aprobado',
    approved: true,
    generated_by: {
      id: appUser.id,
      name: appUser.username,
      email: appUser.email,
      role: appUser.role || 'admin'
    },
    generated_at: generatedAt,
    reviewed_by: {
      id: appUser.id,
      name: appUser.username,
      email: appUser.email,
      role: appUser.role || 'admin'
    },
    reviewed_at: generatedAt,
    approved_by: {
      id: appUser.id,
      name: appUser.username,
      email: appUser.email,
      role: appUser.role || 'admin'
    },
    approved_at: generatedAt
  };
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('cliente', clientRecord.id);
  form.append('folio', `NTF-${Date.now()}`);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', appUser.username);
  form.append('metadata', JSON.stringify(metadata));
  form.append('pdf', new File([makeMinimalPdf(`Dictamen ${state.appUserUsername}`)], `dictamen_${state.appUserUsername}.pdf`, { type: 'application/pdf' }));
  return api('/api/collections/clientes_dictamenes/records', {
    method: 'POST',
    headers: authHeaders(token),
    body: form
  });
}

async function waitForClientReadiness(token, clientId, timeoutMs = 30000) {
  return waitForClient(token, clientId, (row) => row?.expediente_validacion?.readyForQuotes === true, timeoutMs);
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

async function createQuotePending(token, client, appUser, state) {
  const startDate = dateOnly(10);
  const endDate = dateOnly(12);
  const detail = {
    espacio_id: CONFIG.spaceId,
    espacio_nombre: CONFIG.spaceName,
    espacio_clave: CONFIG.spaceKey,
    espacio_tipo: 'publicidad',
    tipo: 'publicidad',
    fecha_inicio: startDate,
    fecha_fin: endDate,
    fechas_evento: [startDate, endDate],
    personas: 120,
    horario: { label: '09:00 - 22:00', start: '09:00', end: '22:00', value: '09:00-22:00', amount: 0 },
    material: 'Publicidad',
    medida_alto: 0,
    medida_ancho: 0,
    medida_unidad: 'M',
    subtotal_espacio: CONFIG.price,
    total_espacio: CONFIG.price,
    impuestos_ids: [],
    impuestos_total: 0,
    unidad_medida: 'M'
  };
  const numeroOrden = `${CONFIG.prefix}-NTF${String(Date.now()).slice(-6)}`;
  const quoteName = `Smoke Notifications ${CONFIG.prefix} ${state.appUserUsername}`;
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
      convenio_base_total: 0,
      convenio_entregable_total: 0,
      convenio_balance_total: 0,
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
    detalles_evento: {
      multi_espacio: false,
      total_espacios: 1,
      nombre_cotizacion: quoteName
    },
    espacios_detalle: [detail],
    nombre_cotizacion: quoteName,
    creado_por: appUser.id,
    creado_por_nombre: appUser.username,
    modificado_por: appUser.id,
    modificado_por_nombre: appUser.username,
    flujo_estado: 'cotizacion_pendiente'
  };
  const quote = await api('/api/collections/cotizaciones/records', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.quoteId = quote.id;
  state.quoteNumeroOrden = numeroOrden;
  state.quoteName = quoteName;
  return quote;
}

async function approveQuote(token, quoteId, appUser) {
  return api(`/api/collections/cotizaciones/records/${encodeURIComponent(quoteId)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      status: 'aprobada',
      flujo_estado: 'cotizacion_aprobada',
      modificado_por: appUser.id,
      modificado_por_nombre: appUser.username
    })
  });
}

async function rejectClientDocument(token, clientId, appUser, reason) {
  const current = await fetchClient(token, clientId);
  const estados = current.documentos_estado && typeof current.documentos_estado === 'object'
    ? { ...current.documentos_estado }
    : {};
  const reviewedAt = nowIso();
  estados.doc_constancia_fiscal = {
    ...(estados.doc_constancia_fiscal || {}),
    status: 'rechazado',
    motivo: reason,
    omitido: false,
    revisado_por_id: appUser.id,
    revisado_por_nombre: appUser.username,
    revisado_at: reviewedAt,
    aprobado_por_id: '',
    aprobado_por_nombre: '',
    aprobado_at: '',
    actualizado_at: '',
    actualizado_desde_rechazo: false
  };
  await api(`/api/collections/clientes/records/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ documentos_estado: estados })
  });
}

async function fetchNotificationsForUser(token, userId) {
  const filter = encodeURIComponent(`user_id="${userId}"`);
  const data = await api(`/api/collections/hub_notifications/records?page=1&perPage=25&sort=-created_at&filter=${filter}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
  return Array.isArray(data.items) ? data.items : [];
}

async function createHubNotification(token, userId, payload) {
  const now = nowIso();
  return api('/api/collections/hub_notifications/records', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      user_id: userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      source_app: payload.source_app || payload.type,
      link: payload.link || '',
      metadata: payload.metadata || {},
      created_at: payload.created_at || now,
      updated_at: payload.updated_at || now
    })
  });
}

async function findLatestQuote(token) {
  const filter = encodeURIComponent(`tenant="${TENANT}"`);
  const data = await api(`/api/collections/cotizaciones/records?page=1&perPage=50&sort=-created_at&filter=${filter}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
  const rows = Array.isArray(data.items) ? data.items : [];
  return rows.find((row) => String(row?.id || '').trim()) || null;
}

async function findLatestReadyClient(token) {
  const filter = encodeURIComponent(`tenant="${TENANT}"`);
  const data = await api(`/api/collections/clientes/records?page=1&perPage=120&sort=-created_at&filter=${filter}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
  const rows = Array.isArray(data.items) ? data.items : [];
  return rows.find((row) => row?.expediente_validacion?.readyForQuotes === true && String(row?.telefono || '').trim()) || null;
}

async function waitForNotifications(token, userId, predicate, timeoutMs = 30000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const rows = await fetchNotificationsForUser(token, userId);
    if (predicate(rows)) return rows;
    await sleep(900);
  }
  throw new Error(`Tiempo agotado esperando notificaciones del usuario ${userId}.`);
}

async function fetchPublicAccessToken(clientId, phone) {
  const response = await fetch(`${BACKEND_URL}/api/cotizador/public-client-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, phone })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.accessToken) {
    throw new Error(data?.message || 'No se pudo obtener access token publico.');
  }
  return String(data.accessToken).trim();
}

async function loginDashboard(page, state) {
  await page.goto(`${FRONTEND_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.fill('#email', state.appUserEmail);
  await page.fill('#password', state.appUserPassword);
  await Promise.all([
    page.waitForURL(/index\.html/, { timeout: 30000 }),
    page.locator('#login-form button[type="submit"]').click()
  ]);
  await page.waitForSelector('#view-dashboard:not(.hidden)', { timeout: 30000 });
}

async function waitForClientVerificationModal(page) {
  await page.waitForFunction(() => {
    const modal = document.getElementById('client-verification-modal');
    return !!modal && !modal.classList.contains('hidden');
  }, { timeout: 30000 });
}

async function assertTextContains(locator, text) {
  const value = await locator.innerText();
  assert.match(value, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return value;
}

async function main() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const state = {
    appUserId: '',
    appUserEmail: '',
    appUserPassword: '',
    appUserUsername: '',
    clientId: '',
    clientName: '',
    clientPhone: '',
    profileClientId: '',
    profileClientName: '',
    profileClientPhone: '',
    quoteId: '',
    quoteNumeroOrden: '',
    quoteName: '',
    accessToken: ''
  };
  const artifacts = {
    dashboardModal: path.join(ARTIFACT_DIR, 'dashboard-notification-modal.png'),
    layoutModal: path.join(ARTIFACT_DIR, 'layout-notification-modal.png'),
    profileScroll: path.join(ARTIFACT_DIR, 'perfil-cliente-scroll.png'),
    result: path.join(ARTIFACT_DIR, 'notification-profile-result.json')
  };

  const superToken = await adminLogin();
  const appUser = await createAppUser(superToken, state);
  const appToken = await authAppUser(state.appUserEmail, state.appUserPassword);

  const createdClient = await createClientReady(appToken, appUser, state);
  await rejectClientDocument(appToken, createdClient.id, appUser, REJECTION_REASON);

  const existingQuote = await findLatestQuote(superToken);
  if (!existingQuote) throw new Error(`No se encontro una cotizacion existente para ${TENANT}.`);
  state.quoteId = String(existingQuote.id || '').trim();
  state.quoteNumeroOrden = String(existingQuote.numero_orden || existingQuote.folio || existingQuote.id || '').trim();
  state.quoteName = String(existingQuote.nombre_cotizacion || existingQuote.detalles_evento?.nombre_cotizacion || '').trim();
  const quoteLink = `${CONFIG.tenantPath}/orders.html?quote=${encodeURIComponent(state.quoteId)}`;
  await createHubNotification(superToken, state.appUserId, {
    title: 'Estatus de cotizacion actualizado',
    message: `${CONFIG.prefix}: ${state.quoteNumeroOrden} cambio de Pendiente a ${String(existingQuote.status || 'aprobada')}.`,
    type: 'quote_status',
    source_app: 'cotizador',
    link: quoteLink,
    metadata: {
      tenant: TENANT,
      cotizacion_id: state.quoteId,
      cotizacion_folio: state.quoteNumeroOrden,
      cliente_nombre: String(existingQuote.cliente_nombre || '').trim(),
      estado_anterior: 'pendiente',
      estado_actual: String(existingQuote.status || 'aprobada').trim(),
      redirect_url: quoteLink,
      redirect_kind: 'quote_detail'
    }
  });

  const profileState = {};
  const profileClient = await createClientReady(appToken, appUser, profileState);
  profileState.accessToken = await fetchPublicAccessToken(profileState.clientId, profileState.clientPhone);
  const customDocForm = new FormData();
  customDocForm.append('access', profileState.accessToken);
  customDocForm.append(`${CUSTOM_UPLOAD_FIELD}_date`, dateOnly(-2));
  customDocForm.append(CUSTOM_UPLOAD_FIELD, new File([makeMinimalPdf(`Informacion bancaria ${profileState.clientId}`)], 'info-bancaria.pdf', { type: 'application/pdf' }));
  const uploadResult = await submitPublicProfileForm(customDocForm);
  assert.equal(uploadResult.ok, true, 'La carga publica del documento custom obligatorio fallo.');
  let workingProfileClient = await waitForClient(superToken, profileState.clientId, (row) => {
    const docState = row?.documentos_estado?.[CUSTOM_DOC_FIELD] || {};
    const validation = row?.expediente_validacion || {};
    const missingDocs = Array.isArray(validation.missingDocuments) ? validation.missingDocuments : [];
    const missingFields = Array.isArray(validation.missingFields) ? validation.missingFields : [];
    const docStatus = String(docState.status || '').toLowerCase();
    return docStatus === 'pendiente' || docStatus === 'aprobado' || (missingDocs.length === 0 && missingFields.length === 0);
  }, 45000);
  const uploadedCustomStatus = String(workingProfileClient?.documentos_estado?.[CUSTOM_DOC_FIELD]?.status || '').toLowerCase();
  if (uploadedCustomStatus && uploadedCustomStatus !== 'aprobado') {
    await setCustomDocDecision(appToken, workingProfileClient, appUser, 'aprobado', '');
    workingProfileClient = await waitForClient(superToken, profileState.clientId, (row) => {
      const docState = row?.documentos_estado?.[CUSTOM_DOC_FIELD] || {};
      const validation = row?.expediente_validacion || {};
      const missingDocs = Array.isArray(validation.missingDocuments) ? validation.missingDocuments : [];
      const missingFields = Array.isArray(validation.missingFields) ? validation.missingFields : [];
      const docStatus = String(docState.status || '').toLowerCase();
      return docStatus === 'aprobado' || (missingDocs.length === 0 && missingFields.length === 0);
    }, 45000);
  }
  await createDictamen(appToken, workingProfileClient, appUser, state);
  const completeProfileClient = await waitForClient(superToken, profileState.clientId, (row) => {
    const validation = row?.expediente_validacion || {};
    const missingDocs = Array.isArray(validation.missingDocuments) ? validation.missingDocuments : [];
    const missingFields = Array.isArray(validation.missingFields) ? validation.missingFields : [];
    return missingDocs.length === 0 && missingFields.length === 0;
  }, 60000);
  state.profileClientId = String(completeProfileClient.id || '').trim();
  state.profileClientName = String(completeProfileClient.nombre_completo || '').trim();
  state.profileClientPhone = String(completeProfileClient.telefono || '').trim();

  const notifications = await waitForNotifications(superToken, state.appUserId, (rows) => {
    const hasQuote = rows.some((row) => String(row.type || '').trim() === 'quote_status' && String(row.metadata?.cotizacion_id || '').trim() === state.quoteId);
    const hasRejectedDoc = rows.some((row) => String(row.type || '').trim() === 'client_document_rejected' && String(row.metadata?.cliente_id || '').trim() === state.clientId);
    return hasQuote && hasRejectedDoc;
  });

  const rejectionNotif = notifications.find((row) => String(row.type || '').trim() === 'client_document_rejected');
  const quoteNotif = notifications.find((row) => String(row.type || '').trim() === 'quote_status' && String(row.metadata?.cotizacion_id || '').trim() === state.quoteId);

  assert.ok(rejectionNotif, 'No se encontro la notificacion de rechazo documental.');
  assert.ok(quoteNotif, 'No se encontro la notificacion de cotizacion aprobada.');
  assert.equal(
    String(rejectionNotif.message || '').trim(),
    `${state.appUserUsername} rechazo Constancia de situacion fiscal del cliente ${state.clientName} por ${REJECTION_REASON}.`
  );
  assert.equal(String(rejectionNotif.metadata?.motivo || '').trim(), REJECTION_REASON);
  assert.match(String(rejectionNotif.link || ''), /clientes\.html\?verify=/);
  assert.equal(String(quoteNotif.metadata?.cotizacion_id || '').trim(), state.quoteId);
  assert.match(String(quoteNotif.link || ''), new RegExp(`orders\\.html\\?quote=${state.quoteId}`));

  state.accessToken = await fetchPublicAccessToken(state.profileClientId, state.profileClientPhone);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await loginDashboard(page, state);
    await page.locator('#btn-toggle-notifs').click();
    const rejectionItem = page.locator('#dash-notif-list > div').filter({ hasText: 'Documento de cliente rechazado' }).first();
    await rejectionItem.waitFor({ state: 'visible', timeout: 30000 });
    const rejectionRowText = await rejectionItem.innerText();
    assert.match(rejectionRowText, /20\d{2}/);
    await rejectionItem.click();
    await page.waitForSelector('#dash-notif-modal:not(.hidden)', { timeout: 30000 });
    await assertTextContains(page.locator('#dash-notif-modal'), REJECTION_REASON);
    await assertTextContains(page.locator('#dash-notif-modal'), state.clientName);
    await page.screenshot({ path: artifacts.dashboardModal, fullPage: true });
    const dashboardCtaLabel = await page.locator('#dash-notif-modal-cta').innerText();
    assert.match(dashboardCtaLabel, /perfil del cliente/i);
    await Promise.all([
      page.waitForURL(new RegExp(`${CONFIG.tenantPath}/clientes\\.html`), { timeout: 30000 }),
      page.locator('#dash-notif-modal-cta').click()
    ]);
    await waitForClientVerificationModal(page);

    await page.goto(`${FRONTEND_URL}/${CONFIG.tenantPath}/orders.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.layoutApi.toggleNotif());
    const quoteItem = page.locator('#global-notif-list > div').filter({ hasText: 'Estatus de cotizacion actualizado' }).first();
    await quoteItem.waitFor({ state: 'visible', timeout: 30000 });
    const quoteRowText = await quoteItem.innerText();
    assert.match(quoteRowText, /20\d{2}/);
    await quoteItem.click();
    await page.waitForSelector('#global-notif-modal:not(.hidden)', { timeout: 30000 });
    await assertTextContains(page.locator('#global-notif-modal'), state.quoteNumeroOrden);
    await page.screenshot({ path: artifacts.layoutModal, fullPage: true });
    const layoutCtaLabel = await page.locator('#global-notif-modal-cta').innerText();
    assert.match(layoutCtaLabel, /cotizacion/i);
    await Promise.all([
      page.waitForURL(new RegExp(`orders\\.html\\?quote=${state.quoteId}`), { timeout: 30000 }),
      page.locator('#global-notif-modal-cta').click()
    ]);
    assert.match(page.url(), new RegExp(`orders\\.html\\?quote=${state.quoteId}`));
    await sleep(1500);

    const profilePage = await context.newPage();
    await profilePage.goto(`${FRONTEND_URL}/public/perfil_cliente.html?access=${encodeURIComponent(state.accessToken)}`, { waitUntil: 'networkidle' });
    await profilePage.waitForSelector('#main-shell', { state: 'visible', timeout: 30000 });
    await profilePage.waitForFunction(() => {
      const pill = document.getElementById('header-status-pill');
      return !!pill && !/cargando/i.test(String(pill.textContent || ''));
    }, { timeout: 30000 });
    const profileState = await profilePage.evaluate(() => {
      const infoPanel = document.querySelector('.info-panel');
      const docsPanel = document.querySelector('.docs-panel');
      const header = document.querySelector('.docs-panel-header');
      const additional = document.getElementById('additional-info-panel');
      const readStyle = (selector) => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          zIndex: style.zIndex,
          display: style.display,
          backdropFilter: style.backdropFilter || style.webkitBackdropFilter || '',
          backgroundImage: style.backgroundImage
        };
      };
      return {
        infoPanel: readStyle(infoPanel),
        docsPanel: readStyle(docsPanel),
        header: readStyle(header),
        additional: readStyle(additional),
        additionalOnlyMode: document.getElementById('edit-view')?.classList.contains('additional-only-mode') === true
      };
    });
    assert.equal(profileState.infoPanel?.zIndex, '1');
    assert.equal(profileState.docsPanel?.zIndex, '2');
    assert.ok(['none', ''].includes(String(profileState.header?.backdropFilter || '')), 'El header del perfil sigue usando blur/transparencia.');
    assert.notEqual(profileState.additional?.display, 'none');
    assert.equal(profileState.additionalOnlyMode, true);
    await profilePage.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.35)));
    await sleep(400);
    await profilePage.screenshot({ path: artifacts.profileScroll, fullPage: true });
    await profilePage.close();

    await fs.writeFile(artifacts.result, JSON.stringify({
      tenant: TENANT,
      appUser: {
        id: state.appUserId,
        email: state.appUserEmail,
        username: state.appUserUsername
      },
      client: {
        id: state.clientId,
        name: state.clientName
      },
      profileClient: {
        id: state.profileClientId,
        name: state.profileClientName
      },
      quote: {
        id: state.quoteId,
        folio: state.quoteNumeroOrden
      },
      notifications: {
        rejectedDocumentId: rejectionNotif.id,
        quoteStatusId: quoteNotif.id
      },
      artifacts
    }, null, 2), 'utf8');

    console.log(JSON.stringify({
      ok: true,
      tenant: TENANT,
      artifacts
    }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
