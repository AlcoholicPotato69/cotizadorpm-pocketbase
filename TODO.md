# TODO - Mejora de generadores PDF y modal movible

Aprobado por el usuario: Opción A (sin límites de arrastre para modales/inspector).

Fase 1: Persistencia de notas en Recibos (Plaza Mayor)
- [ ] client/cotizador/receipts.js
  - [ ] En submitPdfNoteFromModal: además de agregar la nota como recurso visual, persistir en BD:
        cotizaciones.notas_pdf += { docType: 'recibo', text, author, created_at }
  - [ ] Mantener botón "Notas" disponible para todos los usuarios (sin cambios funcionales; ya está).

Fase 2: Modal/Inspector movible sin límites
- [ ] client/cotizador/receipts.js
  - [ ] Ajustar __pmContractsBindReceiptToolbarDrag: remover clamps al viewport; permitir arrastre libre (como orders PM).
- [ ] client/cotizadorcp/receipts.js
  - [ ] Ajustar __contractsBindReceiptToolbarDrag: remover clamps al viewport; permitir arrastre libre.

Fase 3: Firmas editables y textos base
- [ ] client/cotizadorcp/orders.js
  - [ ] Verificar que ya existan campos editables de firma (quien aprueba / subtítulo) para cotización y orden (excluidos contratos).
  - [ ] Sin cambios si ya están operativos (se detecta implementación equivalente a PM).

Fase 4: Botón “Añadir recursos”
- [ ] Verificar presencia en:
  - [ ] client/cotizador/orders.js
  - [ ] client/cotizador/receipts.js
  - [ ] client/cotizadorcp/orders.js
  - [ ] client/cotizadorcp/receipts.js
- [ ] Agregar si falta reutilizando el patrón existente (sin cambios visuales).

Pruebas
- [ ] PM: Recibos -> agregar nota y confirmar que queda persistida en cotizaciones.notas_pdf y visible como recurso en PDF.
- [ ] CP/PM: Recibos -> mover inspector por toda la pantalla (sin restricciones).
- [ ] PM/CP: Orders -> verificar edición de firmas y textos base; que “Notas” y “Añadir recurso” funcionen; contratos sin cambios.
