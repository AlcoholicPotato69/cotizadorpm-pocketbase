# Modulos y Flujos de Negocio

Ultima actualizacion: 2026-03-27

## 1. Plaza Mayor

Ruta base:

- `client/cotizador/`

Modulos:

- `catalog.*`
  alta y mantenimiento de espacios
- `orders.*`
  cotizaciones y documentos principales
- `order_detail.html`
  edicion extendida
- `contracts.*`
  contratos
- `receipts.*`
  recibos, pagos y expediente
- `invoices.*`
  facturas
- `clientes.*`
  gestion e historial
- `reports.*`
  indicadores
- `agenda.html`, `calendar.js`
  vista calendario

Reglas funcionales recientes:

- `publicidad`: Material + Medidas
- `local`, `isla`, `espacio`: Ubicacion + Medidas
- ubicaciones y materiales se configuran desde `users1.html`

## 2. Casa de Piedra

Ruta base:

- `client/cotizadorcp/`

Diferencias funcionales:

- usa logica de eventos y salones
- maneja personas, horarios, horas extra y premontaje
- expone feed ICS para calendario
- contempla flujo de montaje separado del evento principal

Regla importante:

- puede haber dias bloqueados para reserva pero disponibles para premontaje

## 3. Publico

Rutas:

- `client/public/public_plazamayor.html`
- `client/public/public_casadepiedra.html`

Flujo:

1. visitante consulta catalogo
2. selecciona fechas o configuracion
3. sistema calcula precio base
4. se crea cotizacion publica `pendiente`
5. admin la retoma desde modulo autenticado

## 4. Sistema

Ruta:

- `client/system/users1.html`

Responsabilidades:

- administracion de usuarios
- conceptos
- impuestos
- configuraciones PDF
- materiales y ubicaciones de Plaza Mayor

## 5. Flujo administrativo tipico

1. abrir cotizacion
2. ajustar espacios, fechas, conceptos e impuestos
3. guardar
4. abrir preview PDF
5. generar snapshot/documento
6. avanzar a contrato, recibo o invoice

## 6. Flujo de documentos

Orden sugerido de negocio:

1. cotizacion
2. orden de compra o aprobacion
3. contrato
4. recibo/pagos
5. factura

## 7. Flujos sensibles

Especial atencion en:

- `espacios_detalle`
- generadores PDF
- expediente de pagos
- documentos almacenados
- configuracion tenant-aware

