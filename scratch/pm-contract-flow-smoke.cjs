const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const BACKEND_URL = 'http://127.0.0.1:8090';
const FRONTEND_URL = 'http://127.0.0.1:8080/client';
const TENANT = 'plaza_mayor';
const SUPERUSER_EMAIL = 'codex.temp.20260422+contracts@local.test';
const SUPERUSER_PASSWORD = 'CodexTmp!20260422';
const SPACE_ID = 'zq4iwlluy0lg2zk';
const SPACE_NAME = 'Ave en Domo Suburbia';
const SPACE_KEY = 'Z1-3';
const SPACE_PRICE = 49000;
const ARTIFACT_DIR = path.join(process.cwd(), 'scratch', 'contract-flow-artifacts-pm');

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
  const payload = { identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD };
  const data = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!data || !data.token) throw new Error('No se pudo autenticar el superusuario temporal.');
  return data.token;
}

async function createAppUser(token, state) {
  const stamp = `codex-smoke-${Date.now()}`;
  const email = `${stamp}@local.test`;
  const password = 'SmokeFlow!20260422';
  const payload = {
    email,
    password,
    passwordConfirm: password,
    emailVisibility: false,
    verified: true,
    login_username: stamp,
    role: 'admin',
    allowed_tenants: ['plaza_mayor', 'casa_de_piedra'],
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
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.appUserId = user.id;
  state.appUserEmail = email;
  state.appUserPassword = password;
  state.appUserUsername = stamp;
  return user;
}

function buildApprovedDocState(actorId, actorName, approvedAt) {
  return {
    status: 'aprobado',
    motivo: '',
    omitido: false,
    subido_at: approvedAt,
    actualizado_at: '',
    actualizado_desde_rechazo: false,
    revisado_por_id: actorId,
    revisado_por_nombre: actorName,
    revisado_at: approvedAt,
    aprobado_por_id: actorId,
    aprobado_por_nombre: actorName,
    aprobado_at: approvedAt
  };
}

async function createClient(token, appUser, state) {
  const stamp = state.appUserUsername;
  const approvedAt = nowIso();
  const clientName = `Cliente Smoke PM ${stamp}`;
  const rfc = 'XAXX010101000';
  const email = `${stamp}.cliente@local.test`;
  const phone = '4771234567';
  const constanciaDate = dateOnly(-2);
  const comprobanteDate = dateOnly(-7);
  const docStates = {
    doc_acta_constitutiva: buildApprovedDocState(appUser.id, appUser.login_username || state.appUserUsername, approvedAt),
    doc_ine: buildApprovedDocState(appUser.id, appUser.login_username || state.appUserUsername, approvedAt),
    doc_comprobante_domicilio: buildApprovedDocState(appUser.id, appUser.login_username || state.appUserUsername, approvedAt),
    doc_constancia_fiscal: buildApprovedDocState(appUser.id, appUser.login_username || state.appUserUsername, approvedAt)
  };
  const pdfActa = makeMinimalPdf(`Acta ${stamp}`);
  const pdfIne = makeMinimalPdf(`INE ${stamp}`);
  const pdfComprobante = makeMinimalPdf(`Comprobante ${stamp}`);
  const pdfConstancia = makeMinimalPdf(`Constancia ${stamp}`);
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('nombre_completo', clientName);
  form.append('correo', email);
  form.append('telefono', phone);
  form.append('rfc', rfc);
  form.append('documentos_estado', JSON.stringify(docStates));
  form.append('constancia_fiscal_emitida_el', constanciaDate);
  form.append('comprobante_domicilio_emitido_el', `${comprobanteDate} 00:00:00.000Z`);
  form.append('doc_acta_constitutiva', new File([pdfActa], `acta_${stamp}.pdf`, { type: 'application/pdf' }));
  form.append('doc_ine', new File([pdfIne], `ine_${stamp}.pdf`, { type: 'application/pdf' }));
  form.append('doc_comprobante_domicilio', new File([pdfComprobante], `comprobante_${stamp}.pdf`, { type: 'application/pdf' }));
  form.append('doc_constancia_fiscal', new File([pdfConstancia], `constancia_${stamp}.pdf`, { type: 'application/pdf' }));
  const client = await api('/api/collections/clientes/records', {
    method: 'POST',
    headers: authHeaders(token),
    body: form
  });
  state.clientId = client.id;
  state.clientEmail = email;
  state.clientName = clientName;
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

async function uploadApprovedCustomContractDocs(token, client, appUser) {
  const configRow = await fetchConfigRow(token);
  const customDocs = getRequiredCustomContractDocs(configRow);
  if (!customDocs.length) return client;

  const approvedAt = nowIso();
  const nextStates = JSON.parse(JSON.stringify(client.documentos_estado || {}));
  for (let index = 0; index < customDocs.length; index += 1) {
    const definition = customDocs[index] || {};
    const field = String(definition.field || '').trim();
    if (!field) continue;
    const fileName = `${field}_${statefulName(appUser)}.pdf`;
    const emittedDate = definition.requiresDate === true ? dateOnly(-(index + 5)) : '';
    const ruta = `clientes/${TENANT}/${client.id}/${field}/${fileName}`;
    const metadata = {
      source: 'smoke_contract_flow',
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
      ...buildApprovedDocState(appUser.id, appUser.login_username || statefulName(appUser), approvedAt),
      ...(emittedDate ? { fecha_documento: emittedDate } : {})
    };
  }

  await api(`/api/collections/clientes/records/${encodeURIComponent(client.id)}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ documentos_estado: nextStates })
  });
  return api(`/api/collections/clientes/records/${encodeURIComponent(client.id)}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
}

function statefulName(appUser) {
  return String(appUser?.login_username || appUser?.username || appUser?.email || 'smoke').trim();
}

function buildClientSnapshot(clientRecord) {
  const acta = String(clientRecord.doc_acta_constitutiva || '').trim();
  const ine = String(clientRecord.doc_ine || '').trim();
  const comprobante = String(clientRecord.doc_comprobante_domicilio || '').trim();
  const constancia = String(clientRecord.doc_constancia_fiscal || '').trim();
  const comprobanteDate = String(clientRecord.comprobante_domicilio_emitido_el || '').slice(0, 10);
  const constanciaDate = String(clientRecord.constancia_fiscal_emitida_el || '').slice(0, 10);
  return [
    {
      field: 'doc_acta_constitutiva',
      label: 'Acta constitutiva',
      fileName: acta,
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      reason: '',
      validityDate: '',
      reviewedByName: '',
      reviewedAt: '',
      updatedAt: '',
      updatedFromRejection: false
    },
    {
      field: 'doc_ine',
      label: 'INE o identificación',
      fileName: ine,
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      reason: '',
      validityDate: '',
      reviewedByName: '',
      reviewedAt: '',
      updatedAt: '',
      updatedFromRejection: false
    },
    {
      field: 'doc_comprobante_domicilio',
      label: 'Comprobante de domicilio',
      fileName: comprobante,
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      reason: '',
      validityDate: comprobanteDate,
      reviewedByName: '',
      reviewedAt: '',
      updatedAt: '',
      updatedFromRejection: false
    },
    {
      field: 'doc_constancia_fiscal',
      label: 'Constancia de situación fiscal',
      fileName: constancia,
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      reason: '',
      validityDate: constanciaDate,
      reviewedByName: '',
      reviewedAt: '',
      updatedAt: '',
      updatedFromRejection: false
    }
  ];
}

async function createDictamen(token, clientRecord, appUser, state) {
  const snapshot = buildClientSnapshot(clientRecord);
  const hashPayload = {
    tenant: TENANT,
    clientId: clientRecord.id,
    documents: snapshot
  };
  const documentosHash = sha256Hex(stableStringify(hashPayload));
  const pdf = makeMinimalPdf(`Dictamen ${state.appUserUsername}`);
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
      name: appUser.login_username || state.appUserUsername,
      email: appUser.email,
      role: appUser.role || 'admin'
    },
    generated_at: generatedAt,
    reviewed_by: {
      id: appUser.id,
      name: appUser.login_username || state.appUserUsername,
      email: appUser.email,
      role: appUser.role || 'admin'
    },
    reviewed_at: generatedAt,
    approved_by: {
      id: appUser.id,
      name: appUser.login_username || state.appUserUsername,
      email: appUser.email,
      role: appUser.role || 'admin'
    },
    approved_at: generatedAt
  };
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('cliente', clientRecord.id);
  form.append('folio', `SMK-${Date.now()}`);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', appUser.login_username || state.appUserUsername);
  form.append('metadata', JSON.stringify(metadata));
  form.append('pdf', new File([pdf], `dictamen_${state.appUserUsername}.pdf`, { type: 'application/pdf' }));
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

async function waitForClientReadiness(token, clientId, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastClient = null;
  while ((Date.now() - startedAt) < timeoutMs) {
    lastClient = await fetchClient(token, clientId);
    const validation = lastClient.expediente_validacion || {};
    if (validation.readyForQuotes === true && validation.readyForContracts === true) {
      const tag = validation.canGenerateContractTag || validation.contractTag || '';
      if (String(tag || '').trim() || validation.canGenerateContract === true || validation.canGenerateContracts === true) {
        return lastClient;
      }
    }
    await sleep(700);
  }
  return lastClient;
}

async function createQuote(token, clientRecord, state) {
  const startDate = dateOnly(15);
  const endDate = dateOnly(16);
  const detail = {
    espacio_id: SPACE_ID,
    espacio_nombre: SPACE_NAME,
    espacio_clave: SPACE_KEY,
    espacio_tipo: 'publicidad',
    tipo: 'publicidad',
    fecha_inicio: startDate,
    fecha_fin: endDate,
    fechas_evento: [startDate, endDate],
    personas: 120,
    horario: { label: '09:00 - 22:00', start: '09:00', end: '22:00', value: '09:00-22:00', amount: 0 },
    horas_extra: 0,
    horas_extra_cortesia: 0,
    horas_extra_facturables: 0,
    horas_extra_total: 0,
    horas_extra_unitario: 0,
    impuestos_ids: [],
    impuestos_total: 0,
    material: 'Publicidad',
    medida_alto: 0,
    medida_ancho: 0,
    medida_unidad: 'M',
    permanencia_personalizada: false,
    precio_personalizado: null,
    precio_personalizado_activo: false,
    precio_personalizado_modo: 'total',
    premontaje_cortesia_dias: 0,
    premontaje_detalle: [],
    premontaje_dias: 0,
    premontaje_fechas: [],
    premontaje_total: 0,
    subtotal_espacio: SPACE_PRICE,
    total_espacio: SPACE_PRICE,
    convenio_activo: false,
    convenio_balance: SPACE_PRICE,
    convenio_indefinido: false,
    convenio_items: [],
    convenio_monto_entregado: 0,
    unidad_medida: 'M'
  };
  const numeroOrden = `PM-SMK${String(Date.now()).slice(-6)}`;
  const payload = {
    tenant: TENANT,
    cliente_id: clientRecord.id,
    cliente_nombre: clientRecord.nombre_completo,
    cliente_rfc: clientRecord.rfc,
    cliente_contacto: clientRecord.telefono,
    cliente_email: clientRecord.correo,
    cliente_telefono: clientRecord.telefono,
    espacio_id: SPACE_ID,
    espacio_nombre: SPACE_NAME,
    espacio_clave: SPACE_KEY,
    fecha_inicio: startDate,
    fecha_fin: endDate,
    precio_final: SPACE_PRICE,
    desglose_precios: {
      subtotal_antes_impuestos: SPACE_PRICE,
      tax_total: 0,
      auto_calculado: SPACE_PRICE,
      precio_final_usado: SPACE_PRICE,
      convenio_base_total: 0,
      convenio_entregable_total: 0,
      convenio_balance_total: 0,
      impuestos_detalle: [],
      espacios: [detail]
    },
    status: 'aprobada',
    numero_orden: numeroOrden,
    datos_fiscales: {
      rfc_receptor: clientRecord.rfc,
      razon_social_receptor: clientRecord.nombre_completo,
      correo_receptor: clientRecord.correo
    },
    conceptos_adicionales: [],
    tipo_ajuste: 'ninguno',
    valor_ajuste: 0,
    ajuste_es_porcentaje: false,
    desglose_impuestos: [],
    historial_pagos: [],
    datos_factura: {},
    personas: 120,
    detalles_evento: {
      multi_espacio: false,
      total_espacios: 1,
      nombre_cotizacion: `Smoke Contract Flow PM ${state.appUserUsername}`
    },
    espacios_detalle: [detail],
    nombre_cotizacion: `Smoke Contract Flow PM ${state.appUserUsername}`,
    permanencia_personalizada: false,
    creado_por: state.appUserId,
    creado_por_nombre: state.appUserUsername,
    modificado_por: state.appUserId,
    modificado_por_nombre: state.appUserUsername,
    flujo_estado: 'cotizacion_aprobada'
  };
  const quote = await api('/api/collections/cotizaciones/records', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  state.quoteId = quote.id;
  state.quoteNumeroOrden = numeroOrden;
  return quote;
}

async function fetchQuote(token, quoteId) {
  return api(`/api/collections/cotizaciones/records/${encodeURIComponent(quoteId)}`, {
    method: 'GET',
    headers: authHeaders(token)
  });
}

async function findGeneratedDocument(token, quoteId, quote) {
  const quotePath = String(quote.contrato_url || '').trim();
  if (!quotePath) return null;
  const filter = `tenant = '${TENANT}' && cotizacion_id = '${quoteId}' && ruta = '${quotePath}'`;
  const uri = `/api/collections/documentos/records?page=1&perPage=5&filter=${encodeURIComponent(filter)}`;
  const rows = await api(uri, { method: 'GET', headers: authHeaders(token) });
  return Array.isArray(rows.items) ? (rows.items[0] || null) : null;
}

async function runBrowserFlow(state) {
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const artifacts = {
    loginScreenshot: path.join(ARTIFACT_DIR, `${state.appUserUsername}-login.png`),
    clientsScreenshot: path.join(ARTIFACT_DIR, `${state.appUserUsername}-clientes.png`),
    contractsScreenshot: path.join(ARTIFACT_DIR, `${state.appUserUsername}-contracts.png`),
    previewScreenshot: path.join(ARTIFACT_DIR, `${state.appUserUsername}-preview.png`),
    downloadPath: path.join(ARTIFACT_DIR, `${state.appUserUsername}-contrato.pdf`)
  };
  try {
    await page.goto(`${FRONTEND_URL}/index.html`, { waitUntil: 'networkidle' });
    await page.fill('#email', state.appUserEmail);
    await page.fill('#password', state.appUserPassword);
    await page.screenshot({ path: artifacts.loginScreenshot, fullPage: true });
    await Promise.all([
      page.waitForURL(/index\.html/, { timeout: 30000 }),
      page.locator('#login-form button[type="submit"]').click()
    ]);
    await page.waitForSelector('#view-dashboard:not(.hidden)', { timeout: 30000 });

    await page.goto(`${FRONTEND_URL}/cotizador/clientes.html`, { waitUntil: 'networkidle' });
    await page.fill('#clients-search', state.clientName);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: artifacts.clientsScreenshot, fullPage: true });
    const clientCard = page.locator('#clients-grid > div').filter({ hasText: state.clientName }).first();
    await clientCard.waitFor({ timeout: 15000 });
    const clientCardText = await clientCard.innerText();
    assert.match(clientCardText, /Listo para contrato|Puede generar contratos|Dictamen detectado/i, 'La tarjeta del cliente no muestra estado listo para contrato.');

    await page.goto(`${FRONTEND_URL}/cotizador/contracts.html`, { waitUntil: 'networkidle' });
    await page.fill('#search-approved', state.clientName);
    const orderCard = page.locator('#approved-list > div').filter({ hasText: state.clientName }).first();
    await orderCard.waitFor({ timeout: 15000 });
    await orderCard.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: artifacts.contractsScreenshot, fullPage: true });

    const generateButton = page.locator('#btn-generate-contract');
    await expectEnabled(generateButton, 'El botón de generar contrato sigue deshabilitado en contracts.html.');

    const templateSelector = page.locator('#template-selector');
    await templateSelector.waitFor({ timeout: 15000 });
    const templateValue = await templateSelector.inputValue();
    if (!String(templateValue || '').trim()) {
      const options = await templateSelector.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: node.textContent || '' })));
      const candidate = options.find((option) => String(option.value || '').trim());
      if (!candidate) throw new Error('No se encontró ninguna plantilla de contrato cargada.');
      await templateSelector.selectOption(candidate.value);
    }

    await page.waitForFunction(() => {
      const doc = document.getElementById('contract-preview-iframe')?.contentDocument;
      return !!(doc && /contrato/i.test(doc.body?.innerText || ''));
    }, { timeout: 60000 });
    const preview = await page.evaluate(() => {
      const doc = document.getElementById('contract-preview-iframe')?.contentDocument;
      return {
        text: String(doc?.body?.innerText || ''),
        pageCount: doc ? doc.querySelectorAll('[data-pdf-preview-page], .contract-annex-page').length : 0,
        annexCount: doc ? doc.querySelectorAll('.contract-annex-page').length : 0,
        height: doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0
      };
    });
    assert.match(preview.text, /CONTRATO/i, 'La vista previa no contiene el contrato.');
    assert.match(preview.text, /REGLAMENTO/i, 'La vista previa no contiene el reglamento.');
    assert.match(preview.text, /PLANO|GEOGR[AÁ]FICO|UBICACI[OÓ]N/i, 'La vista previa no contiene el plano geográfico.');
    assert.ok(preview.annexCount >= 2, 'La vista previa no separó reglamento y plano como anexos independientes.');
    assert.ok(preview.pageCount >= 3, 'La vista previa no generó páginas separadas para contrato y anexos.');
    await page.screenshot({ path: artifacts.previewScreenshot, fullPage: true });

    await page.fill('#contract-num-assign', `PM-${String(Date.now()).slice(-6)}`);
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await generateButton.click();
    const download = await downloadPromise;
    await download.saveAs(artifacts.downloadPath);
    await page.waitForTimeout(2500);
    assert.ok(fs.existsSync(artifacts.downloadPath), 'No se guardó el PDF descargado de Plaza Mayor.');
    assert.ok(fs.statSync(artifacts.downloadPath).size > 10000, 'El PDF descargado de Plaza Mayor es demasiado pequeño y parece inválido.');
    return artifacts;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function expectEnabled(locator, message) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < 20000) {
    if (await locator.isEnabled()) return;
    await sleep(500);
  }
  throw new Error(message);
}

async function cleanupEntity(token, pathname, id) {
  if (!id) return;
  try {
    await api(`${pathname}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    });
  } catch (_) {}
}

async function cleanupDocuments(token, quoteId, quotePath) {
  if (!quoteId && !quotePath) return;
  const parts = [];
  if (quoteId) parts.push(`cotizacion_id = '${quoteId}'`);
  if (quotePath) parts.push(`ruta = '${quotePath}'`);
  if (!parts.length) return;
  const filter = `tenant = '${TENANT}' && (${parts.join(' || ')})`;
  const list = await api(`/api/collections/documentos/records?page=1&perPage=50&filter=${encodeURIComponent(filter)}`, {
    method: 'GET',
    headers: authHeaders(token)
  }).catch(() => ({ items: [] }));
  const items = Array.isArray(list.items) ? list.items : [];
  for (const item of items) {
    await cleanupEntity(token, '/api/collections/documentos/records', item.id);
  }
}

async function writeResult(result) {
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, 'latest-result.json');
  await fsp.writeFile(target, JSON.stringify(result, null, 2), 'utf8');
}

async function main() {
  const state = {
    appUserId: '',
    appUserEmail: '',
    appUserPassword: '',
    appUserUsername: '',
    clientId: '',
    clientName: '',
    quoteId: '',
    quoteNumeroOrden: '',
    dictamenId: ''
  };
  let adminToken = '';
  let createdClient = null;
  let readyClient = null;
  let createdQuote = null;
  let finalQuote = null;
  let artifacts = null;
  let generatedDocument = null;
  try {
    adminToken = await adminLogin();
    const appUser = await createAppUser(adminToken, state);
    createdClient = await createClient(adminToken, appUser, state);
    createdClient = await uploadApprovedCustomContractDocs(adminToken, createdClient, appUser);
    await createDictamen(adminToken, createdClient, appUser, state);
    readyClient = await waitForClientReadiness(adminToken, createdClient.id);
    if (!readyClient) throw new Error('No se pudo recuperar el cliente temporal.');

    const validation = readyClient.expediente_validacion || {};
    assert.equal(validation.readyForQuotes, true, 'El cliente temporal no quedó listo para cotizar.');
    assert.equal(validation.readyForContracts, true, 'El cliente temporal no quedó listo para contrato.');
    assert.ok(
      validation.canGenerateContract === true
      || validation.canGenerateContracts === true
      || String(validation.canGenerateContractTag || validation.contractTag || '').trim() === 'puede_generar_contrato',
      'El cliente temporal no recibió la etiqueta para generar contrato.'
    );

    createdQuote = await createQuote(adminToken, readyClient, state);
    artifacts = await runBrowserFlow(state);
    finalQuote = await fetchQuote(adminToken, createdQuote.id);
    generatedDocument = await findGeneratedDocument(adminToken, createdQuote.id, finalQuote);

    assert.equal(finalQuote.flujo_estado, 'contrato_generado', 'La cotización temporal no quedó en flujo_estado=contrato_generado.');
    assert.ok(String(finalQuote.contrato_url || '').trim(), 'La cotización temporal no guardó contrato_url.');
    assert.ok(String(finalQuote.numero_contrato || '').trim(), 'La cotización temporal no guardó numero_contrato.');
    assert.ok(generatedDocument && generatedDocument.id, 'No se encontró el documento generado en la colección documentos.');
    assert.ok(fs.existsSync(artifacts.downloadPath), 'No se guardó el PDF descargado desde el navegador.');

    await writeResult({
      ok: true,
      testedAt: nowIso(),
      appUser: {
        id: state.appUserId,
        email: state.appUserEmail,
        username: state.appUserUsername
      },
      client: {
        id: readyClient.id,
        nombre: readyClient.nombre_completo,
        validation: readyClient.expediente_validacion
      },
      quote: {
        id: finalQuote.id,
        numero_orden: finalQuote.numero_orden,
        numero_contrato: finalQuote.numero_contrato,
        flujo_estado: finalQuote.flujo_estado,
        contrato_url: finalQuote.contrato_url
      },
      generatedDocument: generatedDocument ? {
        id: generatedDocument.id,
        ruta: generatedDocument.ruta,
        tipo: generatedDocument.tipo
      } : null,
      artifacts
    });
    console.log(JSON.stringify({
      ok: true,
      appUserEmail: state.appUserEmail,
      clientId: readyClient.id,
      quoteId: finalQuote.id,
      numeroOrden: finalQuote.numero_orden,
      numeroContrato: finalQuote.numero_contrato,
      contratoUrl: finalQuote.contrato_url,
      artifacts
    }, null, 2));
  } finally {
    if (adminToken) {
      const quotePath = finalQuote && finalQuote.contrato_url ? finalQuote.contrato_url : '';
      await cleanupDocuments(adminToken, state.quoteId, quotePath);
      await cleanupEntity(adminToken, '/api/collections/cotizaciones/records', state.quoteId);
      await cleanupEntity(adminToken, '/api/collections/clientes_dictamenes/records', state.dictamenId);
      await cleanupEntity(adminToken, '/api/collections/clientes/records', state.clientId);
      await cleanupEntity(adminToken, '/api/collections/app_users/records', state.appUserId);
    }
  }
}

main().catch(async (error) => {
  await writeResult({
    ok: false,
    testedAt: nowIso(),
    error: {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : ''
    }
  }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
