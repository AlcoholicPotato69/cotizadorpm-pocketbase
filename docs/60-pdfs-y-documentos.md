# PDFs y Documentos

Ultima actualizacion: 2026-03-27

## 1. Archivos principales

Generadores PDF administrativos:

- Plaza Mayor:
  - `client/cotizador/orders.js`
  - `client/cotizador/contracts.js`
  - `client/cotizador/receipts.js`

- Casa de Piedra:
  - `client/cotizadorcp/orders.js`
  - `client/cotizadorcp/contracts.js`
  - `client/cotizadorcp/receipts.js`

Librerias involucradas:

- `client/public/assets/libs/js/html2pdf.js`
- `client/public/assets/libs/js/jspdf.js`

## 2. Preview vs exportacion final

Regla de oro:

- la preview puede ajustarse para mejor visualizacion
- la exportacion final no debe cambiar de tamano o resolucion base sin validar snapshot,
  descarga y documentos historicos

Cuando se toque layout PDF, revisar:

- preview modal
- snapshot guardado en bucket
- descarga local
- generacion de documentos derivados

## 3. Editor PDF

Comportamiento esperado:

- doble click sobre items editables abre inspector
- el inspector debe cerrar solo con la `X`
- no debe cerrarse por click fuera
- debe existir modal bloqueante mientras se toma snapshot y se guarda el documento

## 4. Storage

Bucket usado:

- `documentos`

Comportamiento esperado al abrir un archivo guardado:

1. firmar URL en backend storage
2. descargar blob
3. abrir visor local

Esto evita exponer signed URL completa al usuario final.

## 5. Reglas funcionales actuales

Plaza Mayor:

- publicidad muestra Material en tarjeta y PDF
- local/isla/espacio muestran Ubicacion en tarjeta y PDF
- para PDFs viejos, el sistema intenta resolver ubicacion desde `ubicacion` o desde
  tags compatibles con ubicaciones configuradas

Casa de Piedra:

- maneja documentos propios de eventos, contratos y recibos
- el flujo de premontaje tiene impacto en disponibilidad y en algunos documentos

## 6. Donde tocar segun el cambio

- tabla o encabezados PDF:
  `orders.js` del tenant
- contratos:
  `contracts.js`
- recibos:
  `receipts.js`
- membretes y overlays:
  `configuracion`
- guias de margen:
  `client/js/pdf-margin-guides.js`

## 7. Checklist de validacion despues de tocar PDFs

- preview abre
- snapshot se guarda
- documento se descarga
- documento almacenado vuelve a abrir
- Plaza Mayor resuelve Material/Ubicacion correctamente
- Casa de Piedra mantiene reglas de evento/premontaje

