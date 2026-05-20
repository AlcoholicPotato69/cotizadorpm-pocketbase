# PDFs y Documentos

Ultima actualizacion: 2026-04-14

## 1. Generadores principales

Plaza Mayor:

- `frontend/client/cotizador/orders.js`
  - `window.getOrderHTML`
- `frontend/client/cotizador/contracts.js`
- `frontend/client/cotizador/receipts.js`

Casa de Piedra:

- `frontend/client/cotizadorcp/orders.js`
  - `window.getOrderHTML`
- `frontend/client/cotizadorcp/contracts.js`
- `frontend/client/cotizadorcp/receipts.js`

## 2. Librerias

- `frontend/assets/libs/js/html2pdf.js`
- `frontend/assets/libs/js/jspdf.js`

## 3. Regla clave

La preview puede cambiar visualmente para uso humano, pero la exportación final no debe cambiar de tamaño base sin validar:

- preview
- descarga
- snapshot
- apertura del documento guardado

## 4. Storage

Bucket principal:

- `documentos`

Flujo esperado:

1. firmar URL o resolver acceso
2. descargar blob
3. abrir visor local

## 5. Archivos auxiliares

- `frontend/client/js/pdf-margin-guides.js`

## 6. Checklist despues de tocar PDFs

- preview abre
- snapshot se guarda
- documento se descarga
- documento guardado vuelve a abrir
- Plaza Mayor resuelve Material/Ubicacion correctamente
- Casa de Piedra conserva reglas de evento y premontaje
- las cartas convenio no imprimen precios, montos ni balances
- la informacion economica del convenio solo vive en la cotizacion interna y sus snapshots
- el boton `Etiquetas {{}}` abre el catalogo de variables disponibles para firmas y recursos de texto
- los recursos editables de PDF se pueden redimensionar desde el marco
- al redimensionar desde esquinas se conserva proporcion visual

## 7. Regla especial para cartas convenio

Aplica en:

- `frontend/client/cotizador/orders.js`
- `frontend/client/cotizadorcp/orders.js`

Regla:

- si el documento es una carta convenio, el PDF entregable solo muestra espacios, vigencia, contraprestaciones y responsabilidades
- no deben imprimirse `precio_base`, `subtotal`, `monto`, `balance` ni resumen economico
- los valores monetarios siguen existiendo en `desglose_precios`, `conceptos_adicionales` y `espacios_detalle` para control interno
- la distribucion visual entre publicidad acordada y contraprestacion/vigencia se ajusta en proporcion al contenido de cada cotizacion

## 8. Etiquetas disponibles en plantillas PDF

El editor PDF soporta etiquetas en campos de firma, subtitulos y recursos de texto:

- `{{CLIENT_NAME}}`
- `{{CLIENT_EMAIL}}`
- `{{CLIENT_PHONE}}`
- `{{CLIENT_RFC}}`
- `{{QUOTE_NAME}}`
- `{{FOLIO}}`
- `{{DOC_TITLE}}`
- `{{START_DATE}}`
- `{{END_DATE}}`
- `{{VALIDITY}}`
- `{{TODAY}}`
- `{{CURRENT_USER_NAME}}`
- `{{CURRENT_USER_EMAIL}}`
- `{{VENUE_NAME}}`

Funciones relacionadas:

- Plaza Mayor: `__pmBuildPdfTemplateContext`, `window.openPdfTemplateTagsModal`
- Casa de Piedra: `__cpBuildPdfTemplateContext`, `window.openCpPdfTemplateTagsModal`

Referencia adicional:

- `docs/85-catalogo-de-funciones-y-puntos-de-extension.md`
