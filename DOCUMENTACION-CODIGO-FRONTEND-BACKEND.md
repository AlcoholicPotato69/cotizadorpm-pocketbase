# Documentacion Tecnica: Frontend + Backend (PocketBase)

Fecha: 2026-03-11

## 1. Objetivo del sistema

Sistema de cotizacion multi-tenant para dos operaciones:
- `plaza_mayor` (PM)
- `casa_de_piedra` (CP)

Requisitos de negocio clave:
- Aislamiento total por tenant.
- Roles:
  - `admin`: puede ver ambos tenants.
  - `plaza_mayor`: solo PM.
  - `casa_de_piedra`: solo CP.
- Flujos completos de cotizaciones, expediente/documentos, snapshots PDF, contratos, facturas, agenda, clientes y reportes.

---

## 2. Arquitectura general

### 2.1 Backend (PocketBase)

Componentes principales:
- Ejecutable: `pocketbase.exe`
- Data dir: `pb_data/`
  - `data.db`: metadatos, colecciones, reglas, usuarios, registros.
  - `storage/`: archivos (imagenes, PDFs, XMLs, etc).
- Hooks JS: `pb_hooks/`
  - Ejemplo clave: `pb_hooks/10_cotizaciones.pb.js`
- Migraciones: `pb_migrations/`
  - Ejemplo clave: `pb_migrations/1773300100_fix_rules_native_tenants.js`

Colecciones principales:
- `app_users` (auth/perfil/rol/tenant)
- `clientes`
- `conceptos_catalogo`
- `configuracion`
- `impuestos`
- `espacios`
- `cotizaciones`
- `documentos`

### 2.2 Frontend (HTML + JS vanilla)

Capas actuales:
1. Runtime PocketBase para modulos legacy:
   - `client/services/pb-client.js`
   - expone `window.PB_CLIENT.createClient(...)`
2. Servicios nativos por dominio:
   - `client/services/pb-core.js`
   - `client/services/_shared.js`
   - `client/services/auth.js`
   - `client/services/clientes.js`
   - `client/services/conceptos.js`
   - `client/services/configuracion.js`
   - `client/services/impuestos.js`
   - `client/services/espacios.js`
   - `client/services/cotizaciones.js`
   - `client/services/documentos.js`
3. Modulos funcionales por vista:
   - `client/cotizador/*` (PM)
   - `client/cotizadorcp/*` (CP)
   - `client/js/layout.js` (header/sesion/notifs UI)

---

## 3. Como fluye el sistema (alto nivel)

### 3.1 Login + permisos

1. `client/index.html` autentica con `PB_SERVICES.auth`.
2. Lee perfil real en `app_users` (role + allowed_tenants + tenant_default).
3. Renderiza modulos visibles segun rol/tenant.
4. Cada modulo usa schema/tenant correspondiente para aislamiento.

### 3.2 Cotizaciones

1. Se construye payload con cliente, espacios, fechas, impuestos, conceptos y desglose.
2. Se guarda en `cotizaciones` con tenant correcto.
3. Edicion/aprobacion actualiza status y campos de expediente (`url_cotizacion_final`, etc).
4. Hook backend aplica saneamiento y proteccion de campos para flujos publicos; la validacion estricta de traslapes sigue activa en frontend y esta marcada para refactor backend sin dependencias de runtime global.

### 3.3 Expediente / documentos / snapshots

1. PDFs/XMLs/contratos se suben a `documentos` (bucket logico por tenant/ruta legacy).
2. Se guarda referencia en `cotizaciones`.
3. Lectura usa URLs firmadas para acceso controlado.
4. Eliminacion de cotizacion elimina expediente asociado.

---

## 4. Seguridad y aislamiento

1. No confiar solo en frontend:
- Validaciones criticas en hooks cuando no dependen de estado global del runtime.
- Aislamiento por tenant en reglas de coleccion.

2. Reglas de coleccion:
- `list/view`: filtran por tenant y rol.
- `create/update`: validan tenant contra request y rol.

3. Tenant mapping:
- `finanzas` -> `plaza_mayor`
- `finanzas_casadepiedra` -> `casa_de_piedra`

---

## 5. Estructura de codigo recomendada para lectura

Orden sugerido para entender el proyecto:
1. `client/js/hub-config.js` (urls, modo local, branding).
2. `client/index.html` (entrada, login y rol).
3. `client/js/layout.js` (sesion/layout compartido).
4. `client/services/pb-core.js` + `_shared.js` (infra de datos).
5. `client/services/*.js` (dominio).
6. Modulos funcionales:
   - PM: `client/cotizador/*.js`
   - CP: `client/cotizadorcp/*.js`
7. Backend:
   - `pb_migrations/*.js`
   - `pb_hooks/*.pb.js`

---

## 6. Guia rapida de inicio del sistema

### 6.1 Prerrequisitos
- Windows (scripts .bat/.ps1 preparados para Windows).
- `pocketbase.exe` en raiz del repo.
- Navegador moderno.

### 6.2 Levantar backend

En raiz del repo:

```powershell
.\pocketbase.exe serve --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
```

Por defecto:
- API: `http://127.0.0.1:8090/api/`
- Dashboard: `http://127.0.0.1:8090/_/`

### 6.3 Servir frontend

Servir carpeta `client/` con un servidor estatico.

Ejemplo rapido con Python:

```powershell
cd client
python -m http.server 8080
```

Entrar a:
- `http://127.0.0.1:8080/index.html`

---

## 7. Pruebas tecnicas (smoke tests)

Se agrego runner reproducible:
- `scripts/run_full_smoke_tests.ps1`
- `run_full_smoke_tests.bat`

Valida:
1. Sintaxis JS en frontend/backend hooks/migraciones.
2. Ausencia de referencias runtime legacy en codigo activo.
3. Integridad de rutas `<script src=...>` en HTML.
4. Presencia de `pb-client.js` en paginas aplicables.
5. Smoke backend levantando PocketBase y verificando `/api/health`.

Ejecucion:

```bat
run_full_smoke_tests.bat
```

---

## 8. Backup completo del backend

Se agrego backup integral:
- `scripts/backup_full_backend.ps1`
- `backup_full_backend.bat`

Incluye:
- `pocketbase.exe`
- `pb_data` (DB + storage de imagenes/documentos)
- `pb_hooks`
- `pb_migrations`
- `client/services`
- `client/js/hub-config.js`

Salida:
- Carpeta en `backups/backend_full_YYYYMMDD_HHMMSS/`
- ZIP en `backups/backend_full_YYYYMMDD_HHMMSS.zip`
- `manifest.json`, `checksums.csv`, `RESTORE.txt`

Ejecucion:

```bat
backup_full_backend.bat
```

Si PocketBase esta encendido, por seguridad el script falla para evitar backup inconsistente.
Para permitir backup en caliente:

```powershell
.\scripts\backup_full_backend.ps1 -AllowLiveProcess
```

---

## 9. Restore rapido del backend

1. Detener PocketBase.
2. Descomprimir backup.
3. Reemplazar en repo:
- `pocketbase.exe`
- `pb_data`
- `pb_hooks`
- `pb_migrations`
- `client/services`
- `client/js/hub-config.js`
4. Levantar de nuevo:

```powershell
.\pocketbase.exe serve --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
```

---

## 10. Mantenimiento recomendado

1. Antes de cambios estructurales:
- correr `backup_full_backend.bat`

2. Antes de liberar:
- correr `run_full_smoke_tests.bat`

3. Si se modifica seguridad:
- revisar reglas en colecciones + hooks + tenant mapping.

4. Si se agregan modulos:
- mantener capa `services/*` por dominio y evitar logica critica solo en frontend.

---

## 11. Nota de hotfix (2026-03-11)

- Se corrigio el error 400 de `cotizaciones` (create/update) causado por referencias fuera de alcance en `pb_hooks/10_cotizaciones.pb.js`.
- Como estabilizacion inmediata, el hook quedo sin dependencia a utilidades globales de runtime para permitir guardar, cambiar estado y registrar `url_orden_compra` sin fallos.
- Pendiente recomendado: reinstalar validacion de traslapes 100% backend con funciones puras embebidas en el hook (sin depender de `globalThis` compartido).

---

## 12. Configuracion de contratos, membretes e impuestos (2026-03-11)

- `client/system/users1.html` ahora centraliza por tenant:
  - catalogo de `impuestos` (PM y CP)
  - carga de `plantillas de contrato` (ruta `templates_contratos/` en `documentos` o `documentos-cp`)
  - carga de `membretes PDF` (ruta `membretes_pdf/` en `documentos` o `documentos-cp`)
- Claves nuevas de configuracion:
  - `contract_template_default`: plantilla que usan `cotizador/contracts.html` y `cotizadorcp/contracts.html`
  - `pdf_letterhead_path`: membrete base para generadores PDF (cotizaciones/ordenes/recibos)
- `contracts.html` (PM/CP) ya no administra subidas de plantillas; solo muestra el selector de plantillas vigentes.
- Correccion fiscal CP:
  - calculo de impuestos en cotizacion/catalogo CP ahora toma `impuestos_ids` y fallback `impuestos`, evitando espacios sin impuesto por discrepancia de campo legacy.

---

## 13. Cambio rapido de IP/backend (produccion)

Se unifico la URL base del backend en `client/js/hub-config.js` con prioridad:
1. Query param `?backend=https://TU_DOMINIO`
2. `localStorage.HUB_BACKEND_URL`
3. `window.__HUB_BACKEND_URL` / `window.__BACKEND_URL`
4. Archivo central `client/config/hub-runtime.json` (`BACKEND_URL` o `POCKETBASE_URL`)
5. `window.ENV.POCKETBASE_URL` / `window.ENV.BACKEND_URL`
6. Fallback automatico:
   - local: `http://127.0.0.1:8090`
   - produccion: `window.location.origin`

Helpers disponibles en consola del navegador:

```js
window.setHubBackendUrl('https://TU_DOMINIO'); // guarda y recarga
window.clearHubBackendUrl(); // limpia override y recarga
window.getHubBackendUrl(); // inspecciona URL activa
```

Archivo recomendado `client/config/hub-runtime.json`:

```json
{
  "BACKEND_URL": "https://TU_DOMINIO",
  "POCKETBASE_ANON_KEY": "TU_ANON_KEY",
  "FINANZAS_SCHEMA": "finanzas",
  "LOCAL_MODE": false,
  "COMPANY_LOGO_URL": "",
  "COMPANY_LOGO_URL_CP": "",
  "PM_PDF_LETTERHEAD_URL": "",
  "CP_PDF_LETTERHEAD_URL": "",
  "CP_CALENDAR_ICS_URL": "/api/cotizador/cp-calendar-ics",
  "CP_CALENDAR_ICS_TOKEN": "TOKEN_SEGURO"
}
```

Notas:
- `BACKEND_URL`: URL base de PocketBase.
- `POCKETBASE_ANON_KEY`: key usada por el runtime frontend para autenticar llamadas.
- `FINANZAS_SCHEMA`: schema base para Plaza Mayor (`finanzas`).
- `LOCAL_MODE`: `false` en produccion para no forzar modo local.
- Logos y membretes: si lo dejas vacio, usa defaults del proyecto o configuracion en BD.

Impacto:
- `HUB_CONFIG.pocketbaseUrl`
- `HUB_CONFIG.pocketbaseUrl`
- `HUB_CONFIG.cpCalendarIcsUrl`

---

## 14. ICS calendario CP (configuracion y datos) (2026-03-12)

El feed ICS oficial del sistema es:
- `GET /api/cotizador/cp-calendar-ics`

Configuracion del feed en `hub-config.js`:
- URL con prioridad:
  1. `?ics=...`
  2. `localStorage.HUB_CP_CALENDAR_ICS_URL`
  3. `window.__CP_CALENDAR_ICS_URL`
  4. `client/config/hub-runtime.json` -> `CP_CALENDAR_ICS_URL`
  5. fallback automatico: `{backend}/api/cotizador/cp-calendar-ics`
- Token con prioridad:
  1. `?icsToken=...`
  2. `localStorage.HUB_CP_CALENDAR_ICS_TOKEN`
  3. `window.__CP_CALENDAR_ICS_TOKEN`
  4. `client/config/hub-runtime.json` -> `CP_CALENDAR_ICS_TOKEN`
  5. `window.ENV.CP_CALENDAR_ICS_TOKEN`

Archivo recomendado para produccion:

```json
{
  "BACKEND_URL": "https://TU_DOMINIO",
  "CP_CALENDAR_ICS_URL": "/api/cotizador/cp-calendar-ics",
  "CP_CALENDAR_ICS_TOKEN": "TOKEN_SEGURO"
}
```

Helpers de consola:

```js
window.getCpCalendarIcsUrl();
window.setCpCalendarIcsConfig({ url: 'https://TU_DOMINIO/api/cotizador/cp-calendar-ics', token: 'TOKEN' });
window.clearCpCalendarIcsConfig();
```

Checklist de produccion (lo que debes cambiar):
1. Backend publico correcto:
   - Asegura que `https://TU_DOMINIO/api/cotizador/cp-calendar-ics` responda desde PocketBase.
2. Token en backend:
   - Define variable de entorno `CP_CALENDAR_ICS_TOKEN` en el servidor.
   - Reinicia PocketBase despues de cambiarla.
3. Limpia overrides locales (si hiciste pruebas antes):
   - `window.clearHubBackendUrl({ reload: false })`
   - `window.clearCpCalendarIcsConfig({ reload: false })`
4. Front apuntando al backend real:
   - En navegador: `window.setHubBackendUrl('https://TU_DOMINIO')`
5. Token del front igual al backend:
   - En navegador: `window.setCpCalendarIcsConfig({ token: 'MISMO_TOKEN_DEL_BACKEND' })`
6. Verificacion final:
   - `window.getCpCalendarIcsUrl()` debe devolver la URL final con `token=...`
   - Abrir esa URL en navegador debe mostrar texto ICS con `BEGIN:VCALENDAR`.

Campos que alimentan los eventos ICS:
- Solo toma cotizaciones CP con `status` en `aprobada` o `finalizada`.
- Fechas de evento:
  - `fecha_inicio` / `fecha_fin` o `espacios_detalle[].fecha_inicio/fecha_fin` (multi-espacio).
- Premontajes:
  - `espacios_detalle[].premontaje_fechas`
  - `conceptos_adicionales[].meta.dates` cuando `type = b2b_montaje`.
- Texto visible en calendario externo:
  - `numero_orden`, `cliente_nombre`, `nombre_cotizacion`, `espacio_nombre`, `status`.

Mejoras del payload ICS:
- UIDs estables por cotizacion/espacio para mejor sincronizacion en Google/Outlook.
- `LAST-MODIFIED` por evento para refresco consistente.
- `DESCRIPTION` enriquecido (tipo, estatus, folio, cliente, cotizacion, espacio).
- Fold de lineas RFC5545 para compatibilidad.

---

## 15. Ajuste de PDFs con membrete (2026-03-12)

- Generadores afectados:
  - `client/cotizador/orders.js`
  - `client/cotizadorcp/orders.js`
  - `client/cotizador/contracts.js`
  - `client/cotizadorcp/contracts.js`
  - `client/public/public_casadepiedra.html`
- Se normalizo la altura base de contenido contra el area util real del membrete (margenes top/laterales/inferior).
- Se elimino el salto manual `html2pdf__page-break` en cotizaciones para evitar pagina intermedia en blanco.
- `printContract()` (PM y CP) ahora imprime el borrador con el membrete configurado por tenant.
- El PDF publico de Casa de Piedra ahora intenta usar `configuracion.pdf_letterhead_path` y fallback a `assets/img/cp-letterhead-default.png`.
- Se mantiene el flujo funcional: mismos datos, mismos endpoints y mismo guardado de documentos.

