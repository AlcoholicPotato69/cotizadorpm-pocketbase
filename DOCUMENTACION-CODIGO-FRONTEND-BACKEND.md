# Documentacion Tecnica: Frontend + Backend (PocketBase)

Fecha: 2026-03-11

## Manual TI de despliegue

Para instalacion en servidor y estrategia OAuth sin login de usuario final:
- `MANUAL-IMPLEMENTACION-SERVIDOR-TI.md`

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

### 14.1 Entorno LAN sin internet en el servidor (configuracion recomendada)

Escenario: el servidor esta en red privada y no tiene salida a internet.

1. Usar `backend-service.bat` para fijar IP/URL productiva:
   - `backend-service.bat set-ip 192.168.1.50 8090`
   - o `backend-service.bat set-url http://192.168.1.50:8090`
2. El script actualiza automaticamente:
   - `deploy/backend-service.local.conf`
   - `client/config/hub-runtime.override.json` (prioridad sobre `hub-runtime.json`)
3. Para despliegue automatizado un clic:
   - `deploy-production.bat <IP_O_HOST> [PUERTO_BACKEND] [TIMEOUT_SEG]`
   - Ejecuta: `set-ip -> install -> start -> health-check`
4. Para pruebas locales sin servicio:
   - `run-local-stack.bat [HOST] [BACKEND_PORT] [FRONT_PORT]`
   - `stop-local-stack.bat`
5. Mantener `CP_CALENDAR_ICS_URL` relativo:
   - `"/api/cotizador/cp-calendar-ics"`
6. Token ICS:
   - Si no se usa token en LAN cerrada, dejar vacio.
   - Si se usa, debe coincidir front/backend.
7. Verificacion minima:
   - `http://IP_DEL_SERVIDOR:8090/api/cotizador/cp-calendar-ics`
   - Debe devolver `BEGIN:VCALENDAR`.

### 14.2 HTTPS autofirmado en LAN (nuevo flujo)

Problema detectado:
1. En esta version de PocketBase, `serve --https` usa ACME/autocert.
2. Ese modo falla en entornos cerrados o con IP privada sin dominio publico.

Solucion aplicada en el proyecto:
1. PocketBase queda en HTTP interno.
2. Un proxy local PowerShell publica HTTPS con certificado autofirmado.
3. La activacion se hace con:
   - `backend-service.bat enable-https <IP_O_HOST> [PUERTO_HTTPS]`
4. Para desactivar:
   - `backend-service.bat disable-https`

Cambios tecnicos clave:
1. Script de certificado y binding:
   - `deploy/configure-https-selfsigned.ps1`
2. Proxy HTTPS local:
   - `deploy/https-reverse-proxy.ps1`
3. ServiceHost nativo Windows:
   - `deploy/CotizadorServiceHost.cs`
   - `deploy/build-service-host.bat`
4. Runner de servicio:
   - `deploy/run-pocketbase-service.ps1`

Operacion:
1. `enable-https` genera `.cer` en `deploy/certs/`.
2. Ese certificado debe instalarse en los clientes (Trusted Root) para evitar advertencias.
3. Si cambia IP/host, ejecutar `enable-https` de nuevo para regenerar certificado y URL.
4. `deploy-production.bat` genera log para TI en `logs/deploy-production-*.log`.

### 14.3 Modo simple recomendado (Outlook de escritorio en LAN)

Sin Google, sin OAuth, sin servicios puente externos.

1. En Agenda CP:
   - `Copiar enlace Outlook` para copiar la URL ICS.
   - `Abrir Outlook` para intento automatico por `webcal://`.
2. En Outlook Desktop:
   - `Calendar` -> `Add Calendar` -> `From Internet`.
   - Pegar URL ICS local y confirmar.
3. Actualizaciones:
   - Al cambiar eventos en el cotizador, el feed ICS se actualiza.
   - Outlook replica en su siguiente ciclo de sincronizacion.
4. Fallback:
   - `Descargar ICS` exporta archivo manual si el endpoint no responde.

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


## 16. Separacion Contratos vs Recibos + Preview de Distribucion (2026-03-15)

- Se separo navegacion por modulo sin romper logica existente:
  - `client/cotizador/contracts.html` -> modo `contracts` (solo flujo de contratos en UI).
  - `client/cotizador/receipts.html` -> modo `receipts` (solo flujo de recibos en UI).
  - `client/cotizadorcp/contracts.html` -> modo `contracts`.
  - `client/cotizadorcp/receipts.html` -> modo `receipts`.
- Se agrego `data-page-mode` en `body` para reutilizar el mismo motor JS y evitar duplicar bugs:
  - `contracts`: fuerza pestaña/flujo de contrato.
  - `receipts`: fuerza pestaña/flujo de recibo.
- Archivos JS ajustados para respetar el modo de pagina:
  - `client/cotizador/contracts.js`
  - `client/cotizadorcp/contracts.js`
- Resultado funcional:
  - En `contracts.html` ya no se trabaja el recibo desde la UI (se gestiona en `receipts.html`).
  - En `receipts.html` se mantiene snapshot + PDF + historial + recibo externo + editor drag&drop de recursos.
  - El generador de contratos conserva su flujo de plantilla juridica y switch de membrete.
- Preview visual de distribucion sobre membrete oficial (para validacion previa):
  - `client/public/assets/img/layout-preview-pm.png`
  - `client/public/assets/img/layout-preview-cp.png`
- Nota: los previews son guias visuales de layout (area util y bloques), no reemplazan los generadores ni los templates finales.

## 17. Pestaña global de Recibos + modulo en Index por tenant (2026-03-15)

- Se agrego el acceso `Recibos` en la barra de navegacion de todos los HTML operativos de:
  - `client/cotizador/*.html`
  - `client/cotizadorcp/*.html`
- La nueva ruta usada en ambos tenants es:
  - `receipts.html`
- En `client/index.html` se agrego el modulo tarjeta `Recibos` dentro de `buildModules(prefix, colorKey)`.
  - Esto aplica cuando el usuario tiene acceso a un solo tenant (PM o CP), mostrando el modulo junto al resto de herramientas.
- Se agrego fallback de notificaciones para abrir `cotizador/receipts.html` cuando el tipo de notificacion contiene `recibo` o `receipt`.

## 18. Hardening de estabilidad anti-recarga (2026-03-19)

Objetivo:
- Reducir recargas inesperadas en los flujos de:
  - Creacion de cotizacion (PM/CP).
  - Edicion de layout PDF (contratos/recibos).

Analisis realizado sobre frontend:
- Barrido de triggers de recarga/navegacion en `client/`:
  - `window.location.*`, `beforeunload`, `submit`, `type="submit"`, `F5/Ctrl+R`, `Enter`.
- Verificacion de que casi no existen `<form>` en las vistas operativas (el caso principal es login).
- Revision de scripts criticos:
  - `client/cotizador/catalog.js`
  - `client/cotizadorcp/cotizacion.js`
  - `client/cotizadorcp/catalog.js`
  - `client/cotizador/contracts.js`
  - `client/cotizadorcp/contracts.js`
  - `client/js/layout.js`

Vectores de inestabilidad detectados:
1. Navegaciones directas con `window.location.href` en flujo de cotizacion:
   - Si el destino coincide con la misma URL (mismo path/query), el navegador recarga completo.
   - Ese caso no siempre queda cubierto por parches de `location.reload/assign/replace`.
2. Fallback de modo de pagina en CP demasiado estricto:
   - `CP_PAGE_MODE` caia a `catalog_admin` cuando faltaba `window.__CP_PAGE_MODE`.
   - En esa condicion, acciones de cotizacion podian redirigir a `cotizacion.html?...` estando ya en cotizacion (recarga).
3. Guard de sesion en contratos con redireccion dura:
   - En `contracts.js` PM/CP, un `getSession()` transitoriamente nulo podia forzar `window.location.href = 'index.html'`.
   - Esto produce perdida de contexto y sensacion de refresco abrupto.

Cambios aplicados:
- `client/cotizador/catalog.js`
  - Se agrego `pmNavigateSafely(...)` con normalizacion de URL y bloqueo de same-page reload.
  - Se reemplazaron navegaciones sensibles por helper seguro:
    - salto a `cotizacion.html?space=...`
    - salto post-creacion a `order_detail.html`/`orders.html`
- `client/cotizadorcp/cotizacion.js`
  - `CP_PAGE_MODE` ahora tiene fallback por pathname (`cotizacion.html`) para no degradar a modo catalogo.
  - Se agrego `__cpNavigateSafely(...)` y se reemplazaron redirecciones directas.
- `client/cotizadorcp/catalog.js`
  - Mismo hardening de `CP_PAGE_MODE` por pathname.
  - Se agrego `cpNavigateSafely(...)` y se reemplazaron redirecciones directas.
- `client/cotizador/contracts.js`
  - Se elimino redireccion dura a `index.html` por sesion nula transitoria.
  - Se implemento resolucion de sesion tolerante (`getSession()` + fallback `authStore.model`).
  - Si no hay sesion valida: toast de error y salida segura (sin navegacion forzada).
  - Guardado de draft en `beforeunload` solo para admin (reduce escrituras innecesarias).
  - Limpieza de draft local para no-admin al cargar configuracion.
- `client/cotizadorcp/contracts.js`
  - Mismos ajustes de tolerancia de sesion, no-redireccion forzada y control de drafts.

Comentarios de codigo agregados:
- Se documentaron secciones clave nuevas:
  - helpers de navegacion segura.
  - fallback de modo de pagina en CP.
  - guard de sesion tolerante en contratos.

Validacion tecnica ejecutada:
- Revision de rutas de navegacion directas en archivos intervenidos.
- Verificacion sintactica JS:
  - `node --check client/cotizador/catalog.js`
  - `node --check client/cotizadorcp/cotizacion.js`
  - `node --check client/cotizadorcp/catalog.js`
  - `node --check client/cotizador/contracts.js`
  - `node --check client/cotizadorcp/contracts.js`
  - Resultado: sin errores de sintaxis.

## 19. Personas por concepto en PDF + toggle de membrete en contratos (2026-03-19)

Objetivo:
- Mostrar el numero de personas dentro del texto de cada concepto en PDF (cotizacion y orden de compra).
- Exponer en la UI de contratos el checkbox para activar/desactivar membrete en ambos cotizadores.

Cambios aplicados:
- `client/cotizador/orders.js`
  - En `getOrderHTML(...)` se agrego resolucion de personas por concepto con prioridad:
    1. Campo directo del concepto (`personas/guests` o `meta.personas/meta.guests`).
    2. Personas por espacio en `espacios_detalle` cuando el concepto trae `meta.space_id/meta.spaceId`.
    3. Fallback global de la orden (`o.personas`) si existe.
  - Se actualizo la etiqueta de cada concepto para incluir sufijo:
    - `(... persona)` o `(... personas)`.
  - Se dejaron comentarios de codigo en la seccion de resolucion para mantenimiento.

- `client/cotizadorcp/orders.js`
  - En `getOrderHTML(...)` se agrego la misma logica de resolucion de personas por concepto.
  - Se anexa el sufijo de personas al texto del concepto antes del formateo HTML.
  - Se documenta con comentario breve la prioridad de resolucion aplicada.

- `client/cotizador/contracts.html`
  - Se inserto el bloque UI `2. Membrete` con:
    - Checkbox `id=\"contract-letterhead-toggle\"`.
    - Texto de ayuda para activar/desactivar membrete al imprimir.
  - Se recorrio el bloque de folio a `3. Folio Asignado`.

- `client/cotizadorcp/contracts.html`
  - Se inserto el mismo bloque UI `2. Membrete` con `contract-letterhead-toggle`.
  - Se recorrio el bloque de folio a `3. Folio Asignado`.

Compatibilidad:
- No se modificaron endpoints ni estructura de guardado.
- El checkbox agregado reutiliza la logica existente en:
  - `client/cotizador/contracts.js`
  - `client/cotizadorcp/contracts.js`
  que ya manejaba persistencia/lectura del toggle.

## 20. Fix de modal de recursos PDF (texto) que perdia foco por tecla (2026-03-19)

Problema reportado:
- Al agregar recurso tipo `text` y editarlo en el inspector/listado:
  - despues de una letra se perdia seleccion/foco.
  - habia que volver a dar click para seguir escribiendo.
  - la experiencia se sentia como si el cambio no entrara al primer intento.

Causa tecnica:
- En cada evento `input` se reconstruia UI de edicion (`inspector` y lista de recursos), lo que recreaba nodos y forzaba blur del campo activo.
- Existia llamada a callbacks de reposicion no definidos (`__pmPositionPdfInspector` / `__cpPositionPdfInspector`).

Cambios aplicados:
- `client/cotizador/orders.js`
  - Se agrego bandera `skipEditorUiRefresh` en:
    - `__pmSetPdfStyleConfig(...)`
    - `__pmApplyPdfStyleToLivePreview(...)`
    - `__pmCommitPdfResources(...)`
    - `__pmCommitPdfContentField(...)`
    - `__pmCommitResourceInspectorField(...)`
  - En escritura continua (`input` de texto/textarea/number) se evita reconstruir inspector/lista para conservar foco.
  - Se reemplazo la llamada de reposicion por uso seguro de `panel.__ensureFloatingPosition()` cuando existe.
  - Se ajusto `__pmHandleResourceListEvent(...)` para evitar refresh completo en cada tecla y refrescar preview completo solo en campos que lo requieren (`page`/`enabled`).

- `client/cotizadorcp/orders.js`
  - Mismo ajuste espejo:
    - `skipEditorUiRefresh` en set/apply/commit.
    - escritura continua sin re-render agresivo.
    - reposicion segura con `panel.__ensureFloatingPosition()`.
    - optimizacion de `__cpHandleResourceListEvent(...)` en campos continuos.

Comentarios de codigo:
- Se agregaron comentarios puntuales en secciones criticas para explicar:
  - por que se evita el re-render durante escritura continua.
  - por que se usa `skipEditorUiRefresh` en commits de recursos.

Validacion tecnica:
- `node --check client/cotizador/orders.js`
- `node --check client/cotizadorcp/orders.js`
- Resultado: sin errores de sintaxis.

## 21. Estabilizacion global en editores de contratos y recibos (2026-03-19)

Problema observado:
- El bug de "una letra y se pierde el foco" seguia presente en otros editores (no solo ordenes), especialmente en:
  - inspector flotante de recursos.
  - lista de recursos adicionales.
  - campos de contenido/base dentro del editor PDF.

Causa raiz:
- En eventos `input` continuos se seguia reconstruyendo UI de edicion (inspector/lista/toolbar) en cada tecla.
- Esa reconstruccion recreaba nodos y disparaba blur del control activo.

Archivos corregidos en esta fase:
- `client/cotizador/contracts.js`
- `client/cotizadorcp/contracts.js`
- `client/cotizador/receipts.js`
- `client/cotizadorcp/receipts.js`

Ajustes tecnicos aplicados:
- Se estandarizo la bandera `skipEditorUiRefresh` en el flujo completo:
  - `CommitPdfContentField(...)`
  - `CommitPdfSignLabelField(...)`
  - `CommitResourceInspectorField(...)`
  - `CommitPdfResources(...)`
  - `SetPdfStyleConfig(...)`
  - `ApplyPdfStyleToLivePreview(...)`
- En handlers de inspector/lista se detecta `isContinuousInput` y:
  - se evita re-render agresivo de inspector/lista durante escritura.
  - solo se mantiene refresh completo cuando no es input continuo.
- Se agrego criterio de refresh de preview para campos que realmente lo requieren (`page`/`enabled`) en contratos.
- En recibos se propagaron opciones de skip tambien para campos base (`x`, `y`, `scalePct`, `angle`, `visible`) para mejorar fluidez en edicion fina de layout.

Comentarios de codigo:
- Se agregaron comentarios puntuales en secciones criticas para dejar claro:
  - por que se omite el refresh de UI durante input continuo.
  - como evitar perdida de foco en recursos tipo `text` y campos similares.

Validacion tecnica:
- `node --check client/cotizador/contracts.js`
- `node --check client/cotizadorcp/contracts.js`
- `node --check client/cotizador/receipts.js`
- `node --check client/cotizadorcp/receipts.js`
- Resultado: sin errores de sintaxis.

## 22. Correccion definitiva de foco + refresco de recursos en todos los editores (2026-03-19)

Nuevo hallazgo:
- Persistia el sintoma de "solo permite una letra" en el modal/inspector de recursos.
- En varios casos el recurso no reflejaba cambios (texto, tamano, color, etc.).

Causa raiz final detectada:
1. Aunque existia `skipEditorUiRefresh`, funciones `Ensure...EditingChrome()` seguian llamando render del inspector al final en cada ciclo de apply, provocando blur.
2. En ordenes/contratos, algunos commits de recurso solo refrescaban preview para `page/enabled`, por lo que cambios de texto/estilo no se materializaban visualmente.
3. Los `RefreshPreviewFromStyleState()` y `updateReceiptPreview()` no propagaban opciones para respetar `skipEditorUiRefresh` al rearmar preview.

Archivos ajustados:
- `client/cotizador/orders.js`
- `client/cotizadorcp/orders.js`
- `client/cotizador/contracts.js`
- `client/cotizadorcp/contracts.js`
- `client/cotizador/receipts.js`
- `client/cotizadorcp/receipts.js`

Correcciones aplicadas:
- `Ensure...EditingChrome(options)`:
  - se agrego soporte de `skipEditorUiRefresh`.
  - el render del inspector se omite durante escritura continua.
- `Apply...ToLivePreview(options)`:
  - ahora reenvia opciones a `Ensure...EditingChrome(options)`.
- `RefreshPreviewFromStyleState(options)` y `window.updateReceiptPreview(options)`:
  - ahora aceptan/propagan opciones para que el rebuild del preview no fuerce re-render del inspector.
- En editores de ordenes/contratos:
  - el commit de recursos vuelve a refrescar preview para todos los campos editables de recurso, evitando casos donde no se veian cambios.

Validacion tecnica:
- `node --check client/cotizador/orders.js`
- `node --check client/cotizadorcp/orders.js`
- `node --check client/cotizador/contracts.js`
- `node --check client/cotizadorcp/contracts.js`
- `node --check client/cotizador/receipts.js`
- `node --check client/cotizadorcp/receipts.js`
- Resultado: sin errores de sintaxis.
