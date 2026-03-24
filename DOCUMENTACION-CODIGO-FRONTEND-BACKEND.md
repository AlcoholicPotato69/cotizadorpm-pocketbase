# Documentación Técnica Completa — CotizadorPM + PocketBase

**Última actualización:** 2026-03-23  
**Versión:** 2.0

> Este documento describe la arquitectura completa del sistema, la estructura de archivos,
> el propósito de cada módulo y las convenciones del código para el equipo de TI.

---

## Índice

1. [Visión General](#1-visión-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura de Archivos](#3-estructura-de-archivos)
4. [Backend — PocketBase Hooks](#4-backend--pocketbase-hooks)
5. [Backend — Migraciones](#5-backend--migraciones)
6. [Frontend — Servicios (client/services/)](#6-frontend--servicios-clientservices)
7. [Frontend — Core JS (client/js/)](#7-frontend--core-js-clientjs)
8. [Frontend — Cotizador Plaza Mayor (client/cotizador/)](#8-frontend--cotizador-plaza-mayor-clientcotizador)
9. [Frontend — Cotizador Casa de Piedra (client/cotizadorcp/)](#9-frontend--cotizador-casa-de-piedra-clientcotizadorcp)
10. [Frontend — Páginas Públicas (client/public/)](#10-frontend--páginas-públicas-clientpublic)
11. [Frontend — Administración (client/system/)](#11-frontend--administración-clientsystem)
12. [Configuración y Despliegue](#12-configuración-y-despliegue)
13. [Base de Datos — Colecciones](#13-base-de-datos--colecciones)
14. [Autenticación y Permisos](#14-autenticación-y-permisos)
15. [Seguridad](#15-seguridad)
16. [Comandos Operativos](#16-comandos-operativos)

---

## 1. Visión General

**CotizadorPM** es un sistema web de cotización y gestión de espacios comerciales para dos venues (tenants):

| Tenant | Nombre | Esquema BD |
|--------|--------|------------|
| `plaza_mayor` | Plaza Mayor | `finanzas` |
| `casa_de_piedra` | Casa de Piedra | `finanzas_casadepiedra` |

El sistema permite:
- **Público**: Explorar catálogo de espacios, seleccionar fechas, generar cotización PDF.
- **Admin**: Gestionar cotizaciones, órdenes, contratos, recibos, facturas, clientes, catálogo de conceptos, impuestos, reportes, configuración de precios y PDF.

**Stack tecnológico:**
- **Backend**: PocketBase (Go) con hooks en JavaScript (`pb_hooks/`).
- **Frontend**: Vanilla HTML + JavaScript + TailwindCSS (CDN).
- **Base de datos**: SQLite (integrada en PocketBase).
- **PDF**: jsPDF + jsPDF-AutoTable (generación client-side).

---

## 2. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────┐
│                  NAVEGADOR                       │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Público   │  │ Cotizador│  │ Administración│  │
│  │ (public/) │  │ (PM/CP)  │  │ (system/)     │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│        │             │               │           │
│        └──────┬──────┴───────┬───────┘           │
│               ▼              ▼                   │
│      ┌────────────┐  ┌──────────────┐            │
│      │ services/  │  │ js/layout.js │            │
│      │ pb-core.js │  │ hub-config.js│            │
│      └─────┬──────┘  └──────┬───────┘            │
│            │                │                    │
└────────────┼────────────────┼────────────────────┘
             │                │
             ▼                ▼
┌─────────────────────────────────────────────────┐
│            POCKETBASE (backend)                  │
│                                                  │
│  ┌─────────────┐  ┌──────────────┐               │
│  │ pb_hooks/   │  │ pb_migrations│               │
│  │ (lógica)    │  │ (esquema BD) │               │
│  └──────┬──────┘  └──────┬───────┘               │
│         │                │                       │
│         ▼                ▼                       │
│      ┌────────────────────────┐                  │
│      │    SQLite (pb_data/)   │                  │
│      └────────────────────────┘                  │
└─────────────────────────────────────────────────┘
```

---

## 3. Estructura de Archivos

```
cotizadorpm-pocketbase/
│
├── pocketbase.exe              # Binario del servidor PocketBase
├── levantar-todo.bat           # Script principal de arranque del sistema
├── backend-service.bat         # Gestión del servicio Windows de PocketBase
├── optimize.py                 # Script Python para optimizar assets HTML
│
├── pb_data/                    # Datos de SQLite (NO versionar en producción)
│
├── pb_hooks/                   # Hooks de backend (JavaScript server-side)
│   ├── 00_lib.pb.js            # Librería de utilidades compartidas
│   ├── 10_cotizaciones.pb.js   # Hooks de creación/actualización de cotizaciones
│   └── 30_cp_calendar_ics.pb.js # Generador de feed ICS para Casa de Piedra
│
├── pb_migrations/              # Migraciones de esquema de base de datos
│   ├── 1700000001_init_cotizador.js         # Migración inicial (todas las colecciones)
│   ├── 1700000002_permissions_compat.js     # Reglas de permisos multi-tenant
│   ├── 1773300100_fix_rules_native_tenants.js # Permisos para acceso público
│   ├── 1780000001_espacios_imagenes.js      # Soporte multi-imagen por espacio
│   └── ... (20 archivos de migraciones incrementales)
│
├── client/                     # Frontend completo
│   ├── index.html              # Dashboard principal (login + menú de módulos)
│   │
│   ├── config/                 # Configuración de runtime
│   │   └── hub-runtime.json    # Variables de entorno del frontend
│   │
│   ├── js/                     # JavaScript compartido (core)
│   │   ├── hub-config.js       # Configuración global (backend URL, tenant, logos)
│   │   ├── layout.js           # Navbar, sidebar, navegación, sesión, permisos
│   │   └── pdf-margin-guides.js # Utilidades para guías de márgenes en PDF
│   │
│   ├── services/               # Capa de abstracción para API de PocketBase
│   │   ├── pb-client.js        # Cliente PocketBase (polyfill tipo Supabase JS)
│   │   ├── pb-core.js          # Core: autenticación, tenant, CRUD genérico
│   │   ├── _shared.js          # Utilidades compartidas entre servicios
│   │   ├── auth.js             # Servicio de autenticación (login/logout/sesión)
│   │   ├── security.js         # Utilidades de sanitización y seguridad (XSS)
│   │   ├── clientes.js         # CRUD para colección "clientes"
│   │   ├── conceptos.js        # CRUD para colección "conceptos_catalogo"
│   │   ├── configuracion.js    # CRUD para colección "configuracion"
│   │   ├── cotizaciones.js     # CRUD para colección "cotizaciones" (+normalización)
│   │   ├── documentos.js       # CRUD + upload para colección "documentos"
│   │   ├── espacios.js         # CRUD para colección "espacios"
│   │   └── impuestos.js        # CRUD para colección "impuestos"
│   │
│   ├── cotizador/              # Módulo Plaza Mayor (admin, autenticado)
│   │   ├── catalog.html/.js    # Catálogo de espacios PM (admin)
│   │   ├── cotizacion.html     # Formulario de cotización PM
│   │   ├── orders.html/.js     # Gestión de órdenes PM
│   │   ├── order_detail.html   # Detalle de orden individual PM
│   │   ├── contracts.html/.js  # Gestión de contratos PM
│   │   ├── receipts.html/.js   # Gestión de recibos PM
│   │   ├── invoices.html/.js   # Gestión de facturas PM
│   │   ├── clientes.html/.js   # Gestión de clientes PM
│   │   ├── reports.html/.js    # Reportes y estadísticas PM
│   │   ├── agenda.html         # Vista de agenda PM
│   │   └── calendar.js         # Lógica de calendario PM
│   │
│   ├── cotizadorcp/            # Módulo Casa de Piedra (admin, autenticado)
│   │   ├── catalog.html/.js    # Catálogo de espacios CP (admin)
│   │   ├── cotizacion.html/.js # Formulario de cotización CP
│   │   ├── orders.html/.js     # Gestión de órdenes CP
│   │   ├── order_detail.html   # Detalle de orden individual CP
│   │   ├── contracts.html/.js  # Gestión de contratos CP
│   │   ├── receipts.html/.js   # Gestión de recibos CP
│   │   ├── invoices.html/.js   # Gestión de facturas CP
│   │   ├── clientes.html/.js   # Gestión de clientes CP
│   │   ├── reports.html/.js    # Reportes y estadísticas CP
│   │   ├── agenda.html         # Vista de agenda CP
│   │   ├── calendar.js         # Lógica de calendario CP
│   │   ├── montajes.html/.js   # Gestión de premontajes CP
│   │   └── cotizacion.js       # Lógica de cotización con tarifas B2B
│   │
│   ├── public/                 # Páginas públicas (sin autenticación)
│   │   ├── index.html          # Landing page de selección de venue
│   │   ├── public_plazamayor.html    # Cotizador público Plaza Mayor
│   │   ├── public_casadepiedra.html  # Cotizador público Casa de Piedra
│   │   └── assets/             # Imágenes, fuentes, Tailwind CSS
│   │
│   └── system/                 # Administración del sistema
│       └── users1.html         # Panel admin: conceptos, impuestos, plantillas, config
│
├── deploy/                     # Scripts de despliegue
│   └── backend-service.local.conf  # Configuración local del servicio
│
└── docs/                       # Documentación adicional (si existe)
```

---

## 4. Backend — PocketBase Hooks

Los hooks ejecutan JavaScript server-side dentro de PocketBase. Están en `pb_hooks/` y se cargan en orden numérico.

### 4.1 `00_lib.pb.js` — Librería de Utilidades

Funciones compartidas disponibles globalmente para todos los hooks.

| Función | Descripción |
|---------|-------------|
| `normalizeDate(val)` | Convierte cualquier formato de fecha a `YYYY-MM-DD`. |
| `normalizeDateTimeUTC(val)` | Normaliza fecha+hora a ISO UTC. |
| `calcDays(start, end)` | Calcula el número de días entre dos fechas. |
| `formatICSDate(d)` | Formatea una fecha como `YYYYMMDD` para archivos ICS. |
| `formatICSDateTime(d)` | Formatea fecha+hora como `YYYYMMDDTHHmmssZ`. |
| `escapeICS(str)` | Escapa caracteres especiales para formato iCalendar. |
| `foldICSLine(line)` | Aplica plegado de líneas a 75 bytes (RFC 5545). |
| `extractOrderEntries(record)` | Extrae los ítems de una cotización multi-espacio. |
| `normalizeMoney(val)` | Normaliza un valor monetario a número con 2 decimales. |

### 4.2 `10_cotizaciones.pb.js` — Hooks de Cotizaciones

Se ejecutan al crear o actualizar un registro en la colección `cotizaciones`.

**Hook `onRecordCreateRequest`:**
- Si la solicitud es pública (sin auth):
  - Fuerza `status = "pendiente"`.
  - Valida que `tenant` sea `plaza_mayor` o `casa_de_piedra`.
  - Sanitiza campos de texto (`cliente_nombre`, `nombre_cotizacion`, `cliente_contacto`): strip HTML tags, max length.
  - Valida `cliente_email` contra regex.
  - Valida `cliente_telefono` (solo dígitos, +, -, espacios, paréntesis).
  - Limpia campos sensibles (`numero_orden`, `contrato_url`, etc.).
- Si el usuario está autenticado: aplica permisos normales.

**Hook `onRecordUpdateRequest`:**
- Si el usuario no está autenticado (público): bloquea la actualización.
- Oculta campos sensibles (facturas, contratos) a usuarios no autenticados.

### 4.3 `30_cp_calendar_ics.pb.js` — Feed ICS de Calendario

Endpoint HTTP personalizado: `GET /api/cotizador/cp-calendar-ics`

Genera un archivo `.ics` (iCalendar) con todos los eventos del tenant `casa_de_piedra`.

**Proceso:**
1. Valida token de autenticación (query param `token`).
2. Consulta todas las cotizaciones con status `aprobada` o `finalizada`.
3. Consulta todos los espacios para mapear IDs a nombres.
4. Genera eventos VEVENT con:
   - Fechas de inicio/fin del evento principal.
   - Fechas de premontaje (como eventos separados tipo MONTAJE).
   - Nombre del espacio, cliente, estado.
5. Retorna el archivo con headers de seguridad (`nosniff`, `X-Frame-Options: DENY`).

---

## 5. Backend — Migraciones

Las migraciones definen y actualizan el esquema de la base de datos. Se ejecutan automáticamente al iniciar PocketBase.

| Migración | Propósito |
|-----------|-----------|
| `1700000001_init_cotizador.js` | Crea todas las colecciones iniciales: `clientes`, `conceptos_catalogo`, `configuracion`, `impuestos`, `espacios`, `cotizaciones`, `documentos`, `app_users`. |
| `1700000002_permissions_compat.js` | Aplica reglas de acceso multi-tenant con soporte legacy (`allowed_tenants`, `tenant_default`, `role`). |
| `1773205xxx_updated_*.js` | Actualizaciones incrementales de campos en colecciones existentes. |
| `1773300100_fix_rules_native_tenants.js` | Permisos finales para acceso público (cotizaciones, espacios, conceptos, configuración). |
| `1773401000_add_pdf_generator_settings.js` | Agrega colección de configuración de generadores PDF. |
| `1773402000_ensure_pdf_overlays.js` | Agrega campos de overlays para personalización de PDF. |
| `1773581000_add_cotizaciones_notas_pdf.js` | Campo `notas_pdf` en cotizaciones. |
| `1773582000_add_cotizaciones_audit_fields.js` | Campos de auditoría (`created_by`, `updated_by`). |
| `1780000000_espacios_multi_imagen.js` | Agrega campo `imagen` (tipo file, múltiple) a espacios. |
| `1780000001_espacios_imagenes.js` | Configura `maxSelect: 5` para imágenes y agrega `imagen_principal`. |

---

## 6. Frontend — Servicios (`client/services/`)

Capa de abstracción que expone un API similar a Supabase JS para comunicarse con PocketBase.

### 6.1 `pb-client.js` — Cliente PocketBase

Polyfill completo que adapta la API REST de PocketBase al estilo de Supabase JS.

**Funcionalidades:**
- `createClient(url, anonKey, options)` → crea una instancia del cliente.
- `.from('collection')` → inicia un query builder encadenable.
- `.select()`, `.eq()`, `.neq()`, `.in()`, `.order()`, `.limit()`, `.maybeSingle()` → filtros y opciones.
- `.insert(data)`, `.update(data)`, `.delete()`, `.upsert()` → operaciones CRUD.
- `.auth.signInWithPassword()`, `.auth.getSession()`, `.auth.getUser()`, `.auth.signOut()` → autenticación.
- `.storage.from(bucket)` → operaciones de archivos (upload, download, signed URLs).
- `.schema(name)` → cambia de esquema/tenant.

### 6.2 `pb-core.js` — Core de Servicios

Inicializa el cliente PocketBase y expone funciones de alto nivel.

**Funciones principales:**
- `getSupabaseClient()` → retorna la instancia singleton del cliente.
- `getTenantFilter()` → retorna el filtro de tenant activo.
- `fetchRecords(collection, options)` → consulta con filtro de tenant automático.
- `createRecord(collection, data)` → crea con tenant inyectado.
- `updateRecord(collection, id, data)` → actualiza un registro.
- `deleteRecord(collection, id)` → elimina un registro.
- `hideFieldsForPublic(record, fields)` → oculta campos sensibles.

### 6.3 `_shared.js` — Utilidades Compartidas

**Funciones principales:**
- `generateId()` → genera un ID único alfanumérico.
- `normalizeRecord(record)` → normaliza campos legacy (`legacy_id`, mapping de nombres).
- `mapLegacyRecordOut(record)` → mapea campos del esquema nuevo al formato legacy para compatibilidad.
- `translateFilter(filter)` → traduce filtros del formato legacy al nativo de PocketBase.
- `translatePayload(collection, payload)` → traduce payloads legacy a formato nativo.
- `createCrudService(collection)` → factory que genera un servicio CRUD completo para cualquier colección.
- `getClient(options)` → obtiene el cliente PocketBase con opciones de tenant.

### 6.4 `auth.js` — Autenticación

**Funciones:**
- `login(email, password)` → inicia sesión con email/contraseña.
- `logout()` → cierra la sesión actual.
- `getSession()` → retorna la sesión activa desde localStorage.
- `getProfile()` → obtiene el perfil del usuario autenticado.

### 6.5 `security.js` — Seguridad

Módulo de utilidades para prevención de XSS y validación de inputs.

| Función | Descripción |
|---------|-------------|
| `escapeHtml(str)` | Escapa `<`, `>`, `&`, `"`, `'` para inserción segura en HTML. |
| `sanitizeInput(str, maxLen)` | Recorta, elimina caracteres de control, aplica largo máximo. |
| `stripHtmlTags(str)` | Elimina tags HTML de un string. |
| `isValidEmail(str)` | Valida formato de email con regex. |
| `isValidPhone(str)` | Valida formato de teléfono (dígitos, +, -, espacios, paréntesis). |
| `isSafeRedirectUrl(url)` | Valida que una URL sea relativa o del mismo origen (previene open redirect). |
| `isValidTenant(val)` | Valida que el tenant sea `plaza_mayor` o `casa_de_piedra`. |

### 6.6 Servicios CRUD por Colección

Cada archivo crea un servicio CRUD usando `PBServicesShared.createCrudService()`:

| Archivo | Colección | Notas |
|---------|-----------|-------|
| `clientes.js` | `clientes` | CRUD estándar. |
| `conceptos.js` | `conceptos_catalogo` | CRUD estándar. |
| `configuracion.js` | `configuracion` | CRUD estándar. |
| `espacios.js` | `espacios` | CRUD estándar. |
| `impuestos.js` | `impuestos` | CRUD estándar. |
| `cotizaciones.js` | `cotizaciones` | CRUD + normalización de payload legacy (`cliente_id` → `cliente_legacy_id`, `creado_por` → `creado_por_legacy`). |
| `documentos.js` | `documentos` | CRUD + `upload()` con FormData + `findByLegacyPath()` + `createSignedUrlFromRecord()` para URLs firmadas. |

---

## 7. Frontend — Core JS (`client/js/`)

### 7.1 `hub-config.js` — Configuración Global

Resuelve la configuración del sistema en este orden de prioridad:
1. **Variables globales** (`window.__HUB_BACKEND_URL`).
2. **Archivo runtime** (`client/config/hub-runtime.json`).
3. **Variables de entorno** (`window.ENV`).
4. **Fallback automático** (`http://127.0.0.1:8090`).

**Objeto `window.HUB_CONFIG`** expone:

| Propiedad | Descripción |
|-----------|-------------|
| `pocketbaseUrl` | URL del backend PocketBase. |
| `pocketbaseAnonKey` | Clave anónima para acceso público. |
| `finanzasSchema` | Esquema SQL activo (default: `finanzas`). |
| `localMode` | `true` = modo local sin roles externos. |
| `companyLogoUrl` | URL del logo de Plaza Mayor. |
| `companyLogoUrlCP` | URL del logo de Casa de Piedra. |
| `pmPdfLetterheadUrl` | URL del membrete PDF para Plaza Mayor. |
| `cpPdfLetterheadUrl` | URL del membrete PDF para Casa de Piedra. |
| `cpCalendarIcsUrl` | URL del feed ICS del calendario de Casa de Piedra. |
| `localModules` | Lista de módulos visibles en modo local. |

**Helpers globales:**
- `window.setHubBackendUrl(url)` — Cambia la URL del backend (con persistencia en localStorage).
- `window.clearHubBackendUrl()` — Restaura la URL del backend al valor por defecto.
- `window.getCpCalendarIcsUrl()` — Retorna la URL completa del feed ICS.

### 7.2 `layout.js` — Layout y Navegación

Controla la interfaz de usuario compartida entre todas las páginas autenticadas:

**Funcionalidades principales:**
- Renderizado de navbar y sidebar con menú de navegación.
- Detección automática del tenant activo (Plaza Mayor o Casa de Piedra).
- Gestión de sesión: verificación de login, logout, expiración de token.
- Breadcrumbs y título de página dinámico.
- Toast notifications (`_toast(message, type)`).
- Permisos de usuario: detecta rol `admin`, `plaza_mayor`, `casa_de_piedra`.
- Smart links: navegación SPA-like entre páginas.
- Responsive: menú colapsable en mobile.

### 7.3 `pdf-margin-guides.js` — Guías de Márgenes PDF

Utilidades para el editor visual de márgenes en la generación de PDF:
- Controles drag & drop para definir márgenes top/bottom/left/right.
- Previsualización en tiempo real.
- Persistencia de configuración en la colección `configuracion`.

---

## 8. Frontend — Cotizador Plaza Mayor (`client/cotizador/`)

Módulo para usuarios autenticados del tenant `plaza_mayor`.

| Página | JS | Función |
|--------|----|---------|
| `catalog.html` | `catalog.js` | Lista espacios con carrusel de imágenes, búsqueda, filtros por etiquetas. Permite crear/editar/eliminar espacios (admin). |
| `cotizacion.html` | — | Formulario de cotización: selección de espacio, fechas, precios, conceptos adicionales. |
| `orders.html` | `orders.js` | Lista de órdenes de compra. Gestión de estados, generación de PDF, editor visual. |
| `order_detail.html` | — | Detalle de una orden individual con PDF embebido. |
| `contracts.html` | `contracts.js` | Gestión de contratos. Generación de PDF con plantilla personalizable. |
| `receipts.html` | `receipts.js` | Gestión de recibos de pago. Generación de PDF. |
| `invoices.html` | `invoices.js` | Gestión de facturas (subida de PDF/XML). |
| `clientes.html` | `clientes.js` | CRUD de clientes con búsqueda y filtros. |
| `reports.html` | `reports.js` | Reportes financieros: ingresos por período, ocupación, etc. |
| `agenda.html` | `calendar.js` | Vista de calendario con eventos ocupados/disponibles. |

---

## 9. Frontend — Cotizador Casa de Piedra (`client/cotizadorcp/`)

Módulo análogo para el tenant `casa_de_piedra`, con funcionalidades adicionales:

| Exclusivo CP | Descripción |
|--------------|-------------|
| `cotizacion.js` | Lógica de cotización con tarifas B2B (precios por rango de personas × día de semana). |
| `montajes.html/.js` | Gestión de días de premontaje/desmontaje. |
| Horarios | Soporte de horarios configurables (matutino, vespertino, nocturno). |
| Horas extra | Cálculo con modo fijo o porcentaje configurable. |
| Premontaje | Porcentaje configurable del precio base por día de montaje. |
| Multi-espacio | Una cotización puede incluir múltiples espacios con fechas distintas. |

---

## 10. Frontend — Páginas Públicas (`client/public/`)

Accesibles sin autenticación. Permiten a visitantes explorar y solicitar cotizaciones.

### `index.html` — Landing Page

Página de selección de venue con links a Plaza Mayor y Casa de Piedra.

### `public_plazamayor.html` — Cotizador Público PM

**Flujo:**
1. Carga catálogo de espacios desde PocketBase (solo activos).
2. Muestra tarjetas con carrusel de imágenes, filtros por etiquetas, búsqueda.
3. Al hacer clic: modal de previsualización → modal de cotización.
4. Calendario interactivo con fechas bloqueadas (cotizaciones aprobadas).
5. Selección de rango de fechas → cálculo de precio con IVA.
6. Formulario de contacto (nombre, teléfono, email) con validación client-side.
7. Envío de cotización como registro `status: "pendiente"` en PocketBase.

### `public_casadepiedra.html` — Cotizador Público CP

**Flujo extendido (adicional al de PM):**
1. Campo de número de invitados (obligatorio, define la tarifa B2B).
2. Selector de horario (matutino, vespertino, nocturno, todo el día).
3. Opción de premontaje: selector de días + modal de rango de fechas.
4. Opción de horas extra con cálculo configurable (fijo o porcentaje).
5. Servicios adicionales del catálogo de conceptos (select + agregar).
6. Soporte multi-espacio: botón "Agregar Espacio" para cotizar varios.
7. Generación de PDF estimado (client-side con jsPDF) al enviar.
8. Descarga automática del PDF al completar la cotización.

---

## 11. Frontend — Administración (`client/system/`)

### `users1.html` — Panel de Administración

Restringido a usuarios con rol `admin`. Incluye:

**Secciones:**
- **Conceptos del Catálogo**: CRUD de servicios/conceptos con precio sugerido.
- **Impuestos**: CRUD de impuestos (IVA, ISR, etc.) con porcentaje.
- **Plantillas de Documentos**: Upload/gestión de plantillas de contratos (HTML).
- **Membretes PDF**: Upload/gestión de imágenes de membrete para generación PDF.
- **Configuración CP**: Premontaje (%) y horas extra (fijo/porcentaje) para Casa de Piedra.
- **Editor PDF**: Configuración de posiciones y estilos de elementos en PDF.

**Seguridad:**
- Verificación server-side del rol `admin` al cargar la página.
- Si no es admin: overlay de "Acceso restringido" + redirección automática.
- Todos los botones de acción se deshabilitan si no es admin (UI defense-in-depth).

---

## 12. Configuración y Despliegue

### Archivo de Configuración: `client/config/hub-runtime.json`

```json
{
  "POCKETBASE_URL": "http://127.0.0.1:8090",
  "POCKETBASE_ANON_KEY": "",
  "FINANZAS_SCHEMA": "finanzas",
  "LOCAL_MODE": true,
  "COMPANY_LOGO_URL": "",
  "CP_CALENDAR_ICS_URL": "",
  "CP_CALENDAR_ICS_TOKEN": ""
}
```

### Ejecución Local (sin servicio Windows)

```powershell
# Backend (PocketBase):
.\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations

# Frontend (servidor HTTP estático):
cd client
python -m http.server 8080
```

### Ejecución como Servicio Windows

```batch
# Instalación y arranque automático:
levantar-todo.bat

# Ver estado del servicio:
backend-service.bat status

# Ver configuración activa:
backend-service.bat show

# Limpiar procesos huérfanos:
backend-service.bat cleanup-orphans
```

---

## 13. Base de Datos — Colecciones

| Colección | Tenant | Descripción |
|-----------|--------|-------------|
| `clientes` | ✅ | Clientes/empresas: nombre, RFC, contacto, email, teléfono. |
| `conceptos_catalogo` | ✅ | Catálogo de servicios adicionales: nombre, precio sugerido, activo. |
| `configuracion` | ✅ | Pares clave-valor de configuración (premontaje_pct, hora_extra_cfg, etc.). |
| `impuestos` | ✅ | Tipos de impuesto: nombre, porcentaje, activo. |
| `espacios` | ✅ | Espacios/salones: nombre, clave, tipo, descripción, precio_base, precios_por_dia (JSONB), etiquetas, imágenes, config_b2b, dias_bloqueados. |
| `cotizaciones` | ✅ | Cotizaciones: espacio_id, cliente datos, fechas, precios, desglose, conceptos adicionales, status, documentos asociados, notas PDF. |
| `documentos` | ✅ | Archivos adjuntos (contratos, facturas, recibos): tipo, archivo, ruta legacy. |
| `app_users` | ❌ | Usuarios de la aplicación: email, username, role, tenant_default, allowed_tenants. |
| `profiles` | ❌ | Perfiles de usuario (compat legacy). |

**Campo `tenant`**: Presente en todas las colecciones con ✅. Valores válidos: `plaza_mayor`, `casa_de_piedra`.

---

## 14. Autenticación y Permisos

### Roles

| Rol | Acceso |
|-----|--------|
| `admin` | Acceso completo a ambos tenants + panel de administración. |
| `plaza_mayor` | Solo datos del tenant `plaza_mayor`. |
| `casa_de_piedra` | Solo datos del tenant `casa_de_piedra`. |
| (sin auth) | Solo lectura de espacios activos + creación de cotizaciones pendientes. |

### Reglas de Acceso (API Rules)

Las reglas se definen en las migraciones y controlan el acceso a nivel de colección:

- **Lectura**: Usuarios autenticados ven solo datos de su tenant. Público ve solo espacios activos y cotizaciones aprobadas/finalizadas.
- **Escritura**: Solo usuarios autenticados con tenant correspondiente.
- **Excepción**: Cotizaciones pueden ser creadas sin auth (`status` forzado a `pendiente`).

### Token de Autenticación

- Almacenado en `localStorage` bajo las claves `pb_compat_auth_v1` y `pb_native_auth_v1`.
- Se envía como header `Authorization: Bearer {token}` en cada request.
- El frontend verifica la sesión al cargar cada página; si expira, redirige a login.

---

## 15. Seguridad

### Medidas implementadas

| Medida | Descripción |
|--------|-------------|
| **XSS Prevention** | `escapeHtml()` aplicado a toda interpolación de datos en `innerHTML`. |
| **Input Validation** | Validación client-side y server-side de email, teléfono, nombre. |
| **Open Redirect Prevention** | No se usa `document.referrer` para redireccionamiento. |
| **Query Param Injection** | `?backend=` y `?api=` no sobrescriben la URL del backend. |
| **Tenant Validation** | Server-side: solo acepta valores `plaza_mayor` o `casa_de_piedra`. |
| **HTML Stripping** | Campos de texto se limpian de HTML tags antes de guardar en BD. |
| **Security Headers** | Endpoint ICS incluye `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`. |
| **Console Info Leak** | `console.warn` usa mensajes genéricos sin detalles de errores internos. |
| **Window Security** | `window.open()` usa `noopener,noreferrer` para ventanas nuevas. |
| **Admin Guard** | Panel admin verifica rol server-side antes de mostrar contenido. |

---

## 16. Comandos Operativos

```powershell
# === ARRANQUE RÁPIDO ===
.\levantar-todo.bat                     # Instala y arranca todo

# === GESTIÓN DEL SERVICIO ===
.\backend-service.bat status            # Ver estado
.\backend-service.bat show              # Ver configuración
.\backend-service.bat cleanup-orphans   # Limpiar procesos huérfanos

# === EJECUCIÓN MANUAL ===
.\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations

# === ADMIN DE POCKETBASE ===
# Abrir: http://127.0.0.1:8090/_/
# (Panel de administración nativo de PocketBase)

# === FRONTEND LOCAL ===
cd client && python -m http.server 8080
# Abrir: http://localhost:8080/

# === LIMPIAR OVERRIDES DEL NAVEGADOR ===
# En la consola del navegador:
window.clearHubBackendUrl();
window.clearCpCalendarIcsConfig();
```
