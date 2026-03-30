# Modulos y Flujos de Negocio

Ultima actualizacion: 2026-03-28

## 1. Plaza Mayor

Ruta base:

- `frontend/client/cotizador/`

Módulos:

- `catalog.*`
- `orders.*`
- `order_detail.html`
- `contracts.*`
- `receipts.*`
- `invoices.*`
- `clientes.*`
- `reports.*`
- `agenda.html`
- `calendar.js`

Reglas visibles:

- `publicidad`: Material + Medidas
- `local`, `isla`, `espacio`: Ubicacion + Medidas

## 2. Casa de Piedra

Ruta base:

- `frontend/client/cotizadorcp/`

Diferencias:

- lógica de eventos y salones
- horarios, horas extra y premontaje
- flujo de montaje separado del evento principal

## 3. Publico

Rutas:

- `frontend/client/public/public_plazamayor.html`
- `frontend/client/public/public_casadepiedra.html`

Flujo:

1. visitante consulta catálogo
2. configura fechas o espacio
3. se calcula el precio base
4. se crea una cotización `pendiente`
5. el área administrativa la continúa

## 4. Sistema

Ruta:

- `frontend/client/system/users1.html`

Responsabilidades:

- usuarios
- conceptos
- impuestos
- configuraciones PDF
- materiales y ubicaciones

## 5. Flujo administrativo típico

1. abrir cotización
2. editar espacios, fechas, conceptos e impuestos
3. guardar
4. abrir preview PDF
5. generar documento
6. avanzar a contrato, recibo o invoice
