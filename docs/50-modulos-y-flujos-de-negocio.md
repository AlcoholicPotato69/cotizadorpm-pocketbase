# Modulos y Flujos de Negocio

Ultima actualizacion: 2026-04-13

Este documento describe como opera cada modulo funcional del sistema y donde vive la logica principal en el codigo.

## 1. Plaza Mayor

Ruta base:

- `frontend/client/cotizador/`

Archivos principales:

- `catalog.html` / `catalog.js`
- `orders.html` / `orders.js`
- `order_detail.html`
- `contracts.js`
- `receipts.js`
- `invoices.js`
- `clientes.js`
- `reports.js`
- `agenda.html`

Reglas visibles de negocio:

- el catalogo es principalmente publicitario
- el precio base parte del espacio y sus impuestos
- la permanencia suele ser mensual
- puede haber permanencia personalizada
- puede haber convenio
- la edicion de orden consolida pricing, PDF, contrato, recibo e invoice

## 2. Casa de Piedra

Ruta base:

- `frontend/client/cotizadorcp/`

Archivos principales:

- `catalog.html` / `catalog.js`
- `cotizacion.html` / `cotizacion.js`
- `orders.html` / `orders.js`
- `order_detail.html`
- `contracts.js`
- `receipts.js`

Casa de Piedra es un tenant hibrido:

- usa una logica propia para eventos/salones
- reutiliza parte de la logica de Plaza Mayor para publicidad y convenios

## 3. Logica CP: categoria `publicidad`

Archivo principal:

- `frontend/client/cotizadorcp/cotizacion.js`

Comportamiento:

- trabaja con precio base total del espacio
- permite permanencia personalizada
- permite precio personalizado
- permite convenio solo si el espacio tiene `permite_convenio = true`
- usa impuestos solo cuando no es convenio
- persiste el detalle en `espacios_detalle`
- comparte estructura documental de convenio con Plaza Mayor

Funciones importantes:

- `__cpBuildPublicidadPrice`
- `__cpConvenioCovered`
- `__cpDetailBlocksIndefinitely`
- `__cpQuoteBlocksIndefinitely`

## 4. Logica CP: categoria `espacio`

Archivos principales:

- `frontend/client/cotizadorcp/cotizacion.js`
- `frontend/client/public/public_casadepiedra.html`

Comportamiento:

- usa personas, horario, premontaje y horas extra
- calcula disponibilidad por fechas del evento
- agrega fechas de premontaje
- soporta conceptos `b2b_montaje`
- valida aforo y rango de evento
- persiste `premontaje_fechas`, `horario`, `horas_extra` y `personas`

## 5. Regla hibrida critica en Casa de Piedra

No se permite mezclar `publicidad` con `espacio` en una sola cotizacion.

La validacion vive en:

- `frontend/client/cotizadorcp/cotizacion.js`
  - `__cpCanAddSpaceToQuote`
  - `__cpGetQuoteCategoryMode`

Motivo:

- ambas categorias serializan distinta semantica operativa
- `publicidad` trabaja como campana/convenio
- `espacio` trabaja como evento con agenda y disponibilidad por dia

## 6. Flujo administrativo tipico

1. abrir catalogo o cotizacion administrativa
2. seleccionar espacio(s)
3. capturar cliente o asociar perfil existente
4. configurar fechas y conceptos
5. calcular precio
6. guardar cotizacion
7. editar desde `orders.js`
8. generar PDF/contrato/recibo/factura segun corresponda

## 7. Flujo publico Plaza Mayor

Archivo:

- `frontend/client/public/public_plazamayor.html`

Secuencia:

1. visitante consulta catalogo publico
2. selecciona fechas
3. el sistema calcula inversion base
4. captura datos de contacto
5. se crea una cotizacion `pendiente`
6. el equipo interno la toma desde `orders.js`

## 8. Flujo publico Casa de Piedra

Archivo:

- `frontend/client/public/public_casadepiedra.html`

Secuencia:

1. visitante consulta salones/espacios
2. captura personas y horario
3. define premontaje y horas extra si aplica
4. selecciona fechas disponibles
5. captura datos de contacto
6. se crea una cotizacion `pendiente`
7. el equipo interno la retoma desde `cotizadorcp/orders.js`

Importante:

- el publico CP no cotiza la categoria `publicidad`
- la `publicidad` CP es un flujo administrativo controlado

## 9. Disponibilidad

Plaza Mayor:

- lee cotizaciones aprobadas/finalizadas
- bloquea el rango ocupado

Casa de Piedra:

- lee cotizaciones aprobadas/finalizadas
- bloquea:
  - fechas del evento
  - `premontaje_fechas`
  - conceptos `b2b_montaje`
  - convenios con bloqueo indefinido

Hooks y funciones relacionadas:

- `backend/pb_hooks/31_public_availability.pb.js`
- `frontend/client/cotizadorcp/cotizacion.js`
- `frontend/client/public/public_casadepiedra.html`

## 10. Convenios

Plaza Mayor y Casa de Piedra usan una estructura semejante para convenios:

- snapshot en `desglose_precios`
- banderas en `espacios_detalle`
- metadata en `detalles_evento.convenio`
- evidencias gestionadas desde `orders.js`
- el selector de espacios en `order_detail` solo muestra espacios elegibles para convenio cuando la cotizacion ya esta en ese modo
- las cartas convenio PDF ya no imprimen montos; esos datos quedan solo en el expediente interno

Correccion aplicada en auditoria 2026-04-13:

- el flag `bloqueo_indefinido` ahora se persiste con base en la cobertura real del convenio y no en un valor fijo
- el filtro de `order_detail` usa `permite_convenio = true` para Plaza Mayor y Casa de Piedra
- el flujo multi-espacio sigue permitido en convenio mientras todos los espacios pertenezcan a la categoria compatible

## 11. Sistema y configuracion

Archivo principal:

- `frontend/client/system/config.html`

Responsabilidades:

- usuarios
- conceptos
- impuestos
- documentos/PDF
- configuraciones CP
- materiales y ubicaciones

Nota:

- la documentacion antigua referenciaba `users1.html`
- la pantalla vigente y real es `frontend/client/system/config.html`

## 12. Donde tocar segun el cambio

Cambios PM comerciales:

- `frontend/client/cotizador/catalog.js`
- `frontend/client/cotizador/orders.js`

Cambios CP de eventos/publicidad:

- `frontend/client/cotizadorcp/cotizacion.js`
- `frontend/client/cotizadorcp/orders.js`
- `frontend/client/cotizadorcp/catalog.js`

Cambios publico:

- `frontend/client/public/public_plazamayor.html`
- `frontend/client/public/public_casadepiedra.html`
- `backend/pb_hooks/10_cotizaciones.pb.js`
- `backend/pb_hooks/31_public_availability.pb.js`

Cambios de permisos/sesion:

- `frontend/client/services/auth.js`
- `frontend/client/services/pb-core.js`
- `backend/pb_hooks/20_auth_session.pb.js`
- `backend/pb_migrations/*rules*.js`
