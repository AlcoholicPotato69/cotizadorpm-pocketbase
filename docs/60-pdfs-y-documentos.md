# PDFs y Documentos

Ultima actualizacion: 2026-03-28

## 1. Generadores principales

Plaza Mayor:

- `frontend/client/cotizador/orders.js`
- `frontend/client/cotizador/contracts.js`
- `frontend/client/cotizador/receipts.js`

Casa de Piedra:

- `frontend/client/cotizadorcp/orders.js`
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
