const { test, expect } = require('playwright/test');
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PB_BASE_URL = String(process.env.PB_BASE_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'http://127.0.0.1:8080/client').replace(/\/+$/, '');
const SUPERUSER_EMAIL = String(process.env.PB_SUPERUSER_EMAIL || '').trim();
const SUPERUSER_PASSWORD = String(process.env.PB_SUPERUSER_PASSWORD || '').trim();

const TENANT = 'casa_de_piedra';
const REAL_SPACE_ID = String(process.env.CONTRACT_FLOW_SPACE_ID || '9fa9z06pkomuv2h').trim();
const DEFAULT_TEMPLATE_NAME = 'PLANTILLA_DE_PRUEBA.html';
const ARTIFACT_DIR = path.join(process.cwd(), 'scratch', 'artifacts');
const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 44>>stream\n' +
  'BT /F1 24 Tf 72 720 Td (Codex Smoke Test) Tj ET\n' +
  'endstream\n' +
  'endobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
  'xref\n' +
  '0 6\n' +
  '0000000000 65535 f \n' +
  '0000000010 00000 n \n' +
  '0000000061 00000 n \n' +
  '0000000118 00000 n \n' +
  '0000000243 00000 n \n' +
  '0000000338 00000 n \n' +
  'trailer<</Size 6/Root 1 0 R>>\n' +
  'startxref\n' +
  '408\n' +
  '%%EOF\n',
  'utf8'
);

function ensureEnv() {
  if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
    throw new Error('Define PB_SUPERUSER_EMAIL y PB_SUPERUSER_PASSWORD para ejecutar la prueba.');
  }
}

function uniqueRunId() {
  const stamp = new Date().toISOString().replace(/\D+/g, '').slice(0, 14);
  return `cp${stamp}${crypto.randomBytes(3).toString('hex')}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function buildPdfBlob() {
  return new Blob([MINIMAL_PDF], { type: 'application/pdf' });
}

function buildApprovedDocStates(nowIso) {
  return {
    doc_ine: {
      status: 'aprobado',
      subido_at: nowIso,
      revisado_at: nowIso,
      aprobado_at: nowIso,
      revisado_por_nombre: 'Codex Smoke',
      aprobado_por_nombre: 'Codex Smoke'
    },
    doc_comprobante_domicilio: {
      status: 'aprobado',
      subido_at: nowIso,
      revisado_at: nowIso,
      aprobado_at: nowIso,
      revisado_por_nombre: 'Codex Smoke',
      aprobado_por_nombre: 'Codex Smoke'
    },
    doc_constancia_fiscal: {
      status: 'aprobado',
      subido_at: nowIso,
      revisado_at: nowIso,
      aprobado_at: nowIso,
      revisado_por_nombre: 'Codex Smoke',
      aprobado_por_nombre: 'Codex Smoke'
    }
  };
}

function resolveInstalledBrowserExecutable() {
  const found = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`No se encontro un navegador Chromium instalado. Busque en: ${BROWSER_CANDIDATES.join(', ')}`);
  }
  return found;
}

function buildClientDictamenSnapshot(client) {
  return [
    {
      field: 'doc_acta_constitutiva',
      label: 'Acta constitutiva',
      fileName: '',
      uploaded: false,
      status: 'pendiente',
      omitted: false,
      validityDate: ''
    },
    {
      field: 'doc_ine',
      label: 'INE',
      fileName: Array.isArray(client.doc_ine) ? String(client.doc_ine[0] || '') : String(client.doc_ine || ''),
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      validityDate: ''
    },
    {
      field: 'doc_comprobante_domicilio',
      label: 'Comprobante de domicilio',
      fileName: Array.isArray(client.doc_comprobante_domicilio) ? String(client.doc_comprobante_domicilio[0] || '') : String(client.doc_comprobante_domicilio || ''),
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      validityDate: String(client.comprobante_domicilio_emitido_el || '').slice(0, 10)
    },
    {
      field: 'doc_constancia_fiscal',
      label: 'Constancia de situacion fiscal',
      fileName: Array.isArray(client.doc_constancia_fiscal) ? String(client.doc_constancia_fiscal[0] || '') : String(client.doc_constancia_fiscal || ''),
      uploaded: true,
      status: 'aprobado',
      omitted: false,
      validityDate: String(client.constancia_fiscal_emitida_el || '').slice(0, 10)
    }
  ];
}

async function pbRequest(pathname, options = {}) {
  const url = `${PB_BASE_URL}${pathname}`;
  const headers = Object.assign({}, options.headers || {});
  if (options.token) headers.Authorization = options.token;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
    cache: 'no-store'
  });

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const detail = typeof payload === 'string'
      ? payload
      : (payload.message || JSON.stringify(payload));
    throw new Error(`${options.method || 'GET'} ${pathname} -> ${response.status}: ${detail}`);
  }

  return payload;
}

async function authSuperuser() {
  const payload = await pbRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: SUPERUSER_EMAIL,
      password: SUPERUSER_PASSWORD
    })
  });
  return String(payload.token || '').trim();
}

async function createAppUser(token, runId) {
  const email = `${runId}@local.test`;
  const password = `CodexTmp!${runId.slice(-8)}`;
  const payload = await pbRequest('/api/collections/app_users/records', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      passwordConfirm: password,
      login_username: `codex_${runId}`,
      role: 'admin',
      tenant_default: TENANT,
      allowed_tenants: [TENANT]
    })
  });
  return { record: payload, email, password };
}

async function authAppUser(email, password) {
  const payload = await pbRequest('/api/collections/app_users/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: email,
      password
    })
  });
  return String(payload.token || '').trim();
}

async function getRecord(token, collection, id) {
  return pbRequest(`/api/collections/${collection}/records/${id}`, { token });
}

async function deleteRecord(token, collection, id) {
  if (!id) return;
  await pbRequest(`/api/collections/${collection}/records/${id}`, {
    method: 'DELETE',
    token
  });
}

async function updateRecord(token, collection, id, payload) {
  return pbRequest(`/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function createClient(token, runId) {
  const now = new Date();
  const nowIso = now.toISOString();
  const constanciaDate = now.toISOString().slice(0, 10);
  const comprobanteDate = new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  const states = buildApprovedDocStates(nowIso);
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('nombre_completo', `Codex Smoke ${runId}`);
  form.append('telefono', '4771234567');
  form.append('correo', `${runId}@cliente.test`);
  form.append('rfc', `CSM${runId.slice(-6).toUpperCase()}`);
  form.append('constancia_fiscal_emitida_el', constanciaDate);
  form.append('comprobante_domicilio_emitido_el', comprobanteDate);
  form.append('documentos_estado', JSON.stringify(states));
  form.append('doc_ine', buildPdfBlob(), `ine_${runId}.pdf`);
  form.append('doc_comprobante_domicilio', buildPdfBlob(), `comprobante_${runId}.pdf`);
  form.append('doc_constancia_fiscal', buildPdfBlob(), `constancia_${runId}.pdf`);

  const created = await pbRequest('/api/collections/clientes/records', {
    method: 'POST',
    token,
    body: form
  });

  const touched = await updateRecord(token, 'clientes', created.id, {
    documentos_estado: states,
    constancia_fiscal_emitida_el: constanciaDate,
    comprobante_domicilio_emitido_el: comprobanteDate,
    perfil_publico_actualizado_at: nowIso
  });

  return {
    ...created,
    ...touched,
    constancia_fiscal_emitida_el: constanciaDate,
    comprobante_domicilio_emitido_el: comprobanteDate
  };
}

async function createApprovedDictamen(token, client, runId) {
  const generatedAt = new Date().toISOString();
  const snapshot = buildClientDictamenSnapshot(client);
  const documentosHash = sha256(JSON.stringify({
    tenant: TENANT,
    clientId: client.id,
    documents: snapshot
  }));
  const form = new FormData();
  form.append('tenant', TENANT);
  form.append('cliente', client.id);
  form.append('folio', `DF-${runId.toUpperCase()}`);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', 'Codex Smoke');
  form.append('metadata', JSON.stringify({
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: snapshot,
    cliente_nombre: client.nombre_completo,
    source: 'generated',
    approval_status: 'aprobado',
    approved: true,
    generated_by: { id: 'codex-smoke', name: 'Codex Smoke' },
    generated_at: generatedAt,
    reviewed_by: { id: 'codex-smoke', name: 'Codex Smoke' },
    reviewed_at: generatedAt,
    approved_by: { id: 'codex-smoke', name: 'Codex Smoke' },
    approved_at: generatedAt
  }));
  form.append('pdf', buildPdfBlob(), `dictamen_${runId}.pdf`);
  return pbRequest('/api/collections/clientes_dictamenes/records', {
    method: 'POST',
    token,
    body: form
  });
}

async function getSpace(token, spaceId) {
  return getRecord(token, 'espacios', spaceId);
}

async function createApprovedQuoteWithoutClientId(token, client, space, runId) {
  const startDate = new Date(Date.now() + (15 * 24 * 60 * 60 * 1000));
  const endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
  const fechaInicio = startDate.toISOString().slice(0, 10);
  const fechaFin = endDate.toISOString().slice(0, 10);
  const price = Number(space.precio_base || 145000) || 145000;
  return pbRequest('/api/collections/cotizaciones/records', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant: TENANT,
      cliente_id: '',
      cliente_nombre: client.nombre_completo,
      cliente_rfc: client.rfc,
      cliente_contacto: client.telefono,
      cliente_telefono: client.telefono,
      cliente_email: client.correo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      precio_final: price,
      desglose_precios: {
        subtotal_antes_impuestos: price,
        impuestos_detalle: [],
        tax_total: 0
      },
      status: 'aprobada',
      numero_orden: `CP-SMOKE-${runId.slice(-6).toUpperCase()}`,
      datos_fiscales: {
        rfc_receptor: client.rfc,
        razon_social_receptor: client.nombre_completo,
        correo_receptor: client.correo
      },
      detalles_evento: {
        multi_espacio: false,
        total_espacios: 1
      },
      espacios_detalle: [{
        espacio_id: space.id,
        espacio_nombre: space.nombre,
        espacio_clave: space.clave,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        tipo: space.tipo || 'espacio'
      }],
      personas: 100,
      espacio_id: space.id,
      espacio_nombre: space.nombre,
      espacio_clave: space.clave,
      nombre_cotizacion: `Smoke Contract ${runId}`
    })
  });
}

async function waitForClientReady(token, clientId, predicate, timeoutMs = 30000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const client = await getRecord(token, 'clientes', clientId);
    if (predicate(client)) return client;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Tiempo agotado esperando al cliente ${clientId}.`);
}

async function waitForQuoteUpdate(token, quoteId, predicate, timeoutMs = 120000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const quote = await getRecord(token, 'cotizaciones', quoteId);
    if (predicate(quote)) return quote;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Tiempo agotado esperando a la cotizacion ${quoteId}.`);
}

test.describe.configure({ mode: 'serial' });

test('flujo real de contrato CP resuelve cliente legado y genera PDF', async () => {
  test.setTimeout(10 * 60 * 1000);
  ensureEnv();
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const runId = uniqueRunId();
  const resultPath = path.join(ARTIFACT_DIR, `cp-contract-flow-${runId}.json`);
  const screenshotPath = path.join(ARTIFACT_DIR, `cp-contract-flow-${runId}.png`);
  const downloadPath = path.join(ARTIFACT_DIR, `cp-contract-flow-${runId}.pdf`);

  const cleanup = {
    quoteId: '',
    dictamenId: '',
    clientId: '',
    appUserId: '',
    generatedContractPath: ''
  };

  const notes = {
    runId,
    startedAt: new Date().toISOString(),
    currentClientState: null,
    clientReadyBeforeDictamen: null,
    clientReadyAfterDictamen: null,
    contractsPageState: null,
    quoteAfterGeneration: null,
    consoleErrors: []
  };

  const token = await authSuperuser();
  const executablePath = resolveInstalledBrowserExecutable();
  let browser = null;
  let context = null;
  let page = null;

  try {
    const appUser = await createAppUser(token, runId);
    cleanup.appUserId = String(appUser.record.id || '').trim();
    const appUserToken = await authAppUser(appUser.email, appUser.password);

    const client = await createClient(appUserToken, runId);
    cleanup.clientId = String(client.id || '').trim();

    const clientReadyForQuote = await waitForClientReady(token, cleanup.clientId, (row) => {
      return row?.expediente_validacion?.readyForQuotes === true;
    });
    notes.clientReadyBeforeDictamen = clientReadyForQuote;

    const dictamen = await createApprovedDictamen(appUserToken, clientReadyForQuote, runId);
    cleanup.dictamenId = String(dictamen.id || '').trim();

    const clientReadyForContract = await waitForClientReady(token, cleanup.clientId, (row) => {
      const validation = row?.expediente_validacion || {};
      return validation.readyForContracts === true && validation.canGenerateContract === true;
    });
    notes.clientReadyAfterDictamen = clientReadyForContract;
    notes.currentClientState = clientReadyForContract;

    const space = await getSpace(token, REAL_SPACE_ID);
    const quote = await createApprovedQuoteWithoutClientId(token, clientReadyForContract, space, runId);
    cleanup.quoteId = String(quote.id || '').trim();

    browser = await chromium.launch({
      headless: true,
      executablePath
    });
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1080 }
    });
    page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning' || msg.type() === 'log') {
        notes.consoleErrors.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      notes.consoleErrors.push(`pageerror: ${error?.message || error}`);
    });
    page.on('response', async (response) => {
      if (response.status() < 400) return;
      let body = '';
      try { body = (await response.text()).slice(0, 1000); } catch (_) {}
      notes.consoleErrors.push(`response ${response.status()}: ${response.url()} ${body}`);
    });

    const redirectUrl = `${APP_BASE_URL}/cotizadorcp/contracts.html`;
    await page.goto(`${APP_BASE_URL}/index.html?redirect=${encodeURIComponent(redirectUrl)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(appUser.email);
    await page.locator('#password').fill(appUser.password);

    await Promise.all([
      page.waitForURL(/contracts\.html/i, { timeout: 60000 }),
      page.locator('#login-form button[type="submit"]').click()
    ]);

    const orderItem = page.locator('#approved-list [data-order-id]', { hasText: clientReadyForContract.nombre_completo }).first();
    await expect(orderItem).toBeVisible({ timeout: 60000 });
    await orderItem.click();

    await expect(page.locator('#wk-client-name')).toHaveText(clientReadyForContract.nombre_completo, { timeout: 30000 });
    notes.contractsPageState = await page.evaluate(() => {
      const currentOrder = typeof selectedOrder !== 'undefined' ? selectedOrder : null;
      return {
        selectedOrder: currentOrder,
        canGenerate: (typeof __contractsCanGenerateContract === 'function' && currentOrder)
          ? __contractsCanGenerateContract(currentOrder)
          : null,
        blockReason: (typeof __contractsContractBlockReason === 'function' && currentOrder)
          ? __contractsContractBlockReason(currentOrder)
          : null,
        approvedOrdersCount: typeof approvedOrders !== 'undefined' && Array.isArray(approvedOrders)
          ? approvedOrders.length
          : null
      };
    });
    fs.writeFileSync(resultPath, JSON.stringify({
      ok: false,
      ...notes,
      updatedAt: new Date().toISOString()
    }, null, 2));
    await expect(page.locator('#btn-generate-contract')).toBeEnabled({ timeout: 30000 });

    const contractNum = `CP-TEST-${runId.slice(-6).toUpperCase()}`;
    await page.locator('#contract-num-assign').fill(contractNum);

    const templateSelector = page.locator('#template-selector');
    await expect(templateSelector).toBeVisible({ timeout: 30000 });
    try {
      await templateSelector.selectOption(DEFAULT_TEMPLATE_NAME);
    } catch (_) {
      const options = await templateSelector.locator('option').evaluateAll((nodes) => {
        return nodes
          .map((node) => node.value)
          .filter((value) => typeof value === 'string' && value.trim().length > 0);
      });
      if (!options.length) throw new Error('No se encontraron plantillas de contrato disponibles.');
      await templateSelector.selectOption(options[0]);
    }
    await expect.poll(async () => {
      return page.evaluate(() => {
        const doc = document.getElementById('contract-preview-iframe')?.contentDocument;
        return doc?.body?.innerText || '';
      });
    }, { timeout: 60000, message: 'Esperando previsualización del contrato' }).toMatch(/CONTRATO/i);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    notes.previewBeforeGenerate = await page.evaluate(() => {
      const doc = document.getElementById('contract-preview-iframe')?.contentDocument;
      return {
        text: doc?.body?.innerText || '',
        height: doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || null
      };
    });
    expect(notes.previewBeforeGenerate.text).toMatch(/CONTRATO/i);
    expect(notes.previewBeforeGenerate.text).toMatch(/REGLAMENTO/i);
    if (String(space.tipo || '').toLowerCase() === 'publicidad') {
      expect(notes.previewBeforeGenerate.text).toMatch(/PLANO|GEOGR[AÁ]FICO|UBICACI[OÓ]N/i);
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }).catch(async (error) => {
        notes.afterGenerateDiagnostics = await page.evaluate(() => {
          const iframe = document.getElementById('contract-preview-iframe');
          const doc = iframe?.contentDocument;
          const toastText = Array.from(document.querySelectorAll('div,span,p'))
            .map((node) => String(node.textContent || '').trim())
            .filter((text) => /no se pudo|contrato|generando|error|pdf/i.test(text))
            .slice(-20);
          return {
            generateButtonDisabled: document.getElementById('btn-generate-contract')?.disabled ?? null,
            generateButtonText: document.getElementById('btn-generate-contract')?.innerText || '',
            pendingAction: typeof pendingAction !== 'undefined' ? pendingAction : null,
            previewText: doc?.body?.innerText?.slice(0, 1000) || '',
            previewHeight: doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || null,
            renderContainerHeight: document.getElementById('receipt-pdf-render')?.scrollHeight || null,
            renderContainerText: document.getElementById('receipt-pdf-render')?.innerText?.slice(0, 1000) || '',
            lastGeneratedPdfInfo: window.__contractsLastGeneratedPdfInfo || null,
            selectedOrderContractUrl: typeof selectedOrder !== 'undefined' ? selectedOrder?.contrato_url || '' : '',
            selectedOrderFlowState: typeof selectedOrder !== 'undefined' ? selectedOrder?.flujo_estado || '' : '',
            generateButtonOnclick: document.getElementById('btn-generate-contract')?.getAttribute('onclick') || '',
            toastText
          };
        });
        fs.writeFileSync(resultPath, JSON.stringify({
          ok: false,
          ...notes,
          updatedAt: new Date().toISOString()
        }, null, 2));
        throw error;
      }),
      page.locator('#btn-generate-contract').click()
    ]);
    await download.saveAs(downloadPath);

    const quoteAfterGeneration = await waitForQuoteUpdate(token, cleanup.quoteId, (row) => {
      return String(row?.contrato_url || '').trim().length > 0 && String(row?.flujo_estado || '').trim() === 'contrato_generado';
    });

    cleanup.generatedContractPath = String(quoteAfterGeneration.contrato_url || '').trim();
    notes.quoteAfterGeneration = quoteAfterGeneration;

    expect(String(quoteAfterGeneration.numero_contrato || '').trim()).toBe(contractNum);
    expect(String(quoteAfterGeneration.cliente_id || '').trim()).toBe(cleanup.clientId);
    expect(fs.existsSync(downloadPath)).toBeTruthy();
    expect(fs.statSync(downloadPath).size).toBeGreaterThan(10000);

    fs.writeFileSync(resultPath, JSON.stringify({
      ok: true,
      ...notes,
      finishedAt: new Date().toISOString(),
      artifacts: {
        screenshotPath,
        downloadPath,
        resultPath
      }
    }, null, 2));
  } finally {
    if (page && cleanup.generatedContractPath) {
      try {
        await page.evaluate(async (storedPath) => {
          try {
            await window.globalPocketBase.storage.from('documentos-cp').remove([storedPath]);
          } catch (_) {}
        }, cleanup.generatedContractPath);
      } catch (_) {}
    }

    if (context) {
      try { await context.close(); } catch (_) {}
    }
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }

    await deleteRecord(token, 'cotizaciones', cleanup.quoteId).catch(() => {});
    await deleteRecord(token, 'clientes_dictamenes', cleanup.dictamenId).catch(() => {});
    await deleteRecord(token, 'clientes', cleanup.clientId).catch(() => {});
    await deleteRecord(token, 'app_users', cleanup.appUserId).catch(() => {});
  }
});
